package com.pulsestream.query.service;

import com.pulsestream.query.config.AuthProperties;
import com.pulsestream.query.dto.AuthDtos.ChangePasswordRequest;
import com.pulsestream.query.dto.AuthDtos.LoginRequest;
import com.pulsestream.query.dto.AuthDtos.OperatorDto;
import com.pulsestream.query.dto.AuthDtos.RegisterRequest;
import com.pulsestream.query.dto.AuthDtos.SessionDto;
import com.pulsestream.query.dto.AuthDtos.UpdateProfileRequest;
import com.pulsestream.query.exception.AuthExceptions.ConflictException;
import com.pulsestream.query.exception.AuthExceptions.ForbiddenException;
import com.pulsestream.query.exception.AuthExceptions.InvalidAvatarException;
import com.pulsestream.query.exception.AuthExceptions.UnauthorizedException;
import com.pulsestream.query.model.OperatorAvatarEntity;
import com.pulsestream.query.model.OperatorEntity;
import com.pulsestream.query.model.OperatorSessionEntity;
import com.pulsestream.query.repository.OperatorAvatarRepository;
import com.pulsestream.query.repository.OperatorRepository;
import com.pulsestream.query.repository.OperatorSessionRepository;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Console accounts: registration, sign-in with opaque session tokens, profile and profile photo.
 *
 * <p>A session token is 32 random bytes handed to the browser once; only its SHA-256 is stored, and
 * signing out deletes that row, so a token can be revoked immediately — which a self-contained JWT
 * could not offer without a deny-list.
 */
@Service
public class AuthService {

    private static final Logger log = LoggerFactory.getLogger(AuthService.class);

    private static final String INVALID_CREDENTIALS = "Username or password is incorrect.";

    private final OperatorRepository operators;
    private final OperatorSessionRepository sessions;
    private final OperatorAvatarRepository avatars;
    private final AuthProperties properties;
    private final Clock clock;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
    private final SecureRandom random = new SecureRandom();
    // Compared against when the username does not exist, so an unknown user and a wrong password
    // take the same time and cannot be told apart from the outside.
    private final String dummyHash = encoder.encode("not-a-real-password");

    @Autowired
    public AuthService(
            OperatorRepository operators,
            OperatorSessionRepository sessions,
            OperatorAvatarRepository avatars,
            AuthProperties properties) {
        this(operators, sessions, avatars, properties, Clock.systemUTC());
    }

    AuthService(
            OperatorRepository operators,
            OperatorSessionRepository sessions,
            OperatorAvatarRepository avatars,
            AuthProperties properties,
            Clock clock) {
        this.operators = operators;
        this.sessions = sessions;
        this.avatars = avatars;
        this.properties = properties;
        this.clock = clock;
    }

    @Transactional
    public SessionDto register(RegisterRequest request) {
        if (!properties.registrationEnabled()) {
            throw new ForbiddenException("Account creation is disabled on this console.");
        }
        String username = normalizeUsername(request.username());
        if (operators.existsByUsername(username)) {
            throw new ConflictException("The username '" + username + "' is already taken.");
        }
        Instant now = clock.instant();
        OperatorEntity operator = operators.save(new OperatorEntity(
                username,
                encoder.encode(request.password()),
                request.displayName().trim(),
                blankToNull(request.email()),
                now));
        log.info("Registered console operator '{}'", username);
        return openSession(operator, now);
    }

    @Transactional
    public SessionDto login(LoginRequest request) {
        String username = normalizeUsername(request.username());
        Optional<OperatorEntity> operator = operators.findByUsername(username);
        String hash = operator.map(OperatorEntity::getPasswordHash).orElse(dummyHash);
        boolean matches = encoder.matches(request.password(), hash);
        if (operator.isEmpty() || !matches) {
            log.warn("Rejected sign-in for '{}'", username);
            throw new UnauthorizedException(INVALID_CREDENTIALS);
        }
        Instant now = clock.instant();
        sessions.deleteExpired(now);
        return openSession(operator.get(), now);
    }

    /** Resolves the operator behind a bearer token, or fails with 401. */
    @Transactional(readOnly = true)
    public OperatorEntity authenticate(String token) {
        if (token == null || token.isBlank()) {
            throw new UnauthorizedException("Sign in to continue.");
        }
        OperatorSessionEntity session = sessions.findByTokenHash(sha256(token))
                .filter(candidate -> !candidate.isExpiredAt(clock.instant()))
                .orElseThrow(() -> new UnauthorizedException("Your session has expired. Sign in again."));
        return operators.findById(session.getOperatorId())
                .orElseThrow(() -> new UnauthorizedException("Your session has expired. Sign in again."));
    }

    @Transactional
    public void logout(String token) {
        if (token != null && !token.isBlank()) {
            sessions.deleteByTokenHash(sha256(token));
        }
    }

    @Transactional(readOnly = true)
    public OperatorDto describe(OperatorEntity operator) {
        return toDto(operator);
    }

    @Transactional
    public OperatorDto updateProfile(OperatorEntity operator, UpdateProfileRequest request) {
        OperatorEntity managed = reload(operator);
        managed.updateProfile(request.displayName().trim(), blankToNull(request.email()), clock.instant());
        return toDto(operators.save(managed));
    }

    @Transactional
    public void changePassword(OperatorEntity operator, ChangePasswordRequest request) {
        OperatorEntity managed = reload(operator);
        if (!encoder.matches(request.currentPassword(), managed.getPasswordHash())) {
            throw new UnauthorizedException("The current password is incorrect.");
        }
        managed.changePasswordHash(encoder.encode(request.newPassword()), clock.instant());
        operators.save(managed);
    }

    @Transactional
    public OperatorDto replaceAvatar(OperatorEntity operator, String declaredType, byte[] data) {
        if (data == null || data.length == 0) {
            throw new InvalidAvatarException("Choose an image to upload.", false);
        }
        if (data.length > properties.maxAvatarBytes()) {
            throw new InvalidAvatarException(
                    "The photo is larger than " + properties.maxAvatarBytes() / 1024 + " KB.", true);
        }
        // The declared content type comes from the client; the bytes decide what is actually stored.
        String contentType = detectImageType(data)
                .orElseThrow(() -> new InvalidAvatarException("Use a PNG, JPEG or WebP image.", false));
        if (declaredType != null && !declaredType.isBlank() && !declaredType.equalsIgnoreCase(contentType)) {
            log.debug("Avatar declared as {} but detected as {}", declaredType, contentType);
        }
        Instant now = clock.instant();
        OperatorAvatarEntity avatar = avatars.findById(operator.getId())
                .map(existing -> {
                    existing.replace(contentType, data, now);
                    return existing;
                })
                .orElseGet(() -> new OperatorAvatarEntity(operator.getId(), contentType, data, now));
        avatars.save(avatar);
        return toDto(reload(operator));
    }

    @Transactional(readOnly = true)
    public Optional<OperatorAvatarEntity> findAvatar(OperatorEntity operator) {
        return avatars.findById(operator.getId());
    }

    @Transactional
    public OperatorDto removeAvatar(OperatorEntity operator) {
        avatars.findById(operator.getId()).ifPresent(avatars::delete);
        avatars.flush();
        return toDto(reload(operator));
    }

    private SessionDto openSession(OperatorEntity operator, Instant now) {
        byte[] raw = new byte[32];
        random.nextBytes(raw);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
        Instant expiresAt = now.plus(properties.sessionTtl());
        sessions.save(new OperatorSessionEntity(sha256(token), operator.getId(), now, expiresAt));
        return new SessionDto(token, expiresAt, toDto(operator));
    }

    private OperatorDto toDto(OperatorEntity operator) {
        return new OperatorDto(
                operator.getId(),
                operator.getUsername(),
                operator.getDisplayName(),
                operator.getEmail(),
                operator.getCreatedAt(),
                avatars.findUpdatedAt(operator.getId()).orElse(null));
    }

    private OperatorEntity reload(OperatorEntity operator) {
        return operators.findById(operator.getId())
                .orElseThrow(() -> new UnauthorizedException("Your session has expired. Sign in again."));
    }

    static Optional<String> detectImageType(byte[] data) {
        if (data.length >= 8 && (data[0] & 0xFF) == 0x89 && data[1] == 'P' && data[2] == 'N' && data[3] == 'G') {
            return Optional.of("image/png");
        }
        if (data.length >= 3 && (data[0] & 0xFF) == 0xFF && (data[1] & 0xFF) == 0xD8 && (data[2] & 0xFF) == 0xFF) {
            return Optional.of("image/jpeg");
        }
        if (data.length >= 12
                && new String(data, 0, 4, StandardCharsets.US_ASCII).equals("RIFF")
                && new String(data, 8, 4, StandardCharsets.US_ASCII).equals("WEBP")) {
            return Optional.of("image/webp");
        }
        return Optional.empty();
    }

    private static String normalizeUsername(String username) {
        return username == null ? "" : username.trim().toLowerCase(Locale.ROOT);
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    static String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException("SHA-256 is required by every JVM", impossible);
        }
    }
}
