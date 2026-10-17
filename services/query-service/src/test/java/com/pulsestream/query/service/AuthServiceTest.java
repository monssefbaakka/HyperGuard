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
import com.pulsestream.query.model.OperatorEntity;
import com.pulsestream.query.repository.OperatorAvatarRepository;
import com.pulsestream.query.repository.OperatorRepository;
import com.pulsestream.query.repository.OperatorSessionRepository;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@ActiveProfiles("test")
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
class AuthServiceTest {

    private static final Instant NOW = Instant.parse("2026-09-13T10:00:00Z");
    private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13};

    @Autowired
    private OperatorRepository operators;

    @Autowired
    private OperatorSessionRepository sessions;

    @Autowired
    private OperatorAvatarRepository avatars;

    private MutableClock clock;
    private AuthService service;

    @BeforeEach
    void setUp() {
        clock = new MutableClock(NOW);
        service = new AuthService(operators, sessions, avatars, new AuthProperties(Duration.ofHours(1), true, 1024), clock);
    }

    @Test
    void registerStoresAHashedPasswordAndOpensASession() {
        SessionDto session = service.register(new RegisterRequest("Monssef", "correct-horse", "Monssef B.", "m@example.com"));

        OperatorEntity stored = operators.findByUsername("monssef").orElseThrow();
        assertThat(stored.getPasswordHash()).startsWith("$2").doesNotContain("correct-horse");
        assertThat(session.token()).hasSizeGreaterThan(40);
        assertThat(session.expiresAt()).isEqualTo(NOW.plus(Duration.ofHours(1)));
        assertThat(session.operator().username()).isEqualTo("monssef");
        assertThat(sessions.findAll()).singleElement()
                .satisfies(row -> assertThat(row.getTokenHash()).isNotEqualTo(session.token()).hasSize(64));
    }

    @Test
    void registerRejectsATakenUsernameRegardlessOfCase() {
        service.register(new RegisterRequest("operator", "password-1", "One", null));

        assertThatThrownBy(() -> service.register(new RegisterRequest("OPERATOR", "password-2", "Two", null)))
                .isInstanceOf(ConflictException.class);
    }

    @Test
    void registerIsRefusedWhenDisabled() {
        AuthService closed = new AuthService(operators, sessions, avatars, new AuthProperties(Duration.ofHours(1), false, 1024), clock);

        assertThatThrownBy(() -> closed.register(new RegisterRequest("someone", "password-1", "Someone", null)))
                .isInstanceOf(ForbiddenException.class);
    }

    @Test
    void loginAuthenticatesAndLogoutRevokesTheToken() {
        service.register(new RegisterRequest("operator", "password-1", "Operator", null));

        SessionDto session = service.login(new LoginRequest("Operator", "password-1"));
        assertThat(service.authenticate(session.token()).getUsername()).isEqualTo("operator");

        service.logout(session.token());
        assertThatThrownBy(() -> service.authenticate(session.token())).isInstanceOf(UnauthorizedException.class);
    }

    @Test
    void loginFailsTheSameWayForAWrongPasswordAndAnUnknownUser() {
        service.register(new RegisterRequest("operator", "password-1", "Operator", null));

        assertThatThrownBy(() -> service.login(new LoginRequest("operator", "wrong-password")))
                .isInstanceOf(UnauthorizedException.class)
                .hasMessage("Username or password is incorrect.");
        assertThatThrownBy(() -> service.login(new LoginRequest("nobody", "password-1")))
                .isInstanceOf(UnauthorizedException.class)
                .hasMessage("Username or password is incorrect.");
    }

    @Test
    void anExpiredSessionIsRejected() {
        SessionDto session = service.register(new RegisterRequest("operator", "password-1", "Operator", null));

        clock.advance(Duration.ofHours(1));

        assertThatThrownBy(() -> service.authenticate(session.token())).isInstanceOf(UnauthorizedException.class);
    }

    @Test
    void profileAndPasswordCanBeChanged() {
        SessionDto session = service.register(new RegisterRequest("operator", "password-1", "Operator", "old@example.com"));
        OperatorEntity operator = service.authenticate(session.token());

        OperatorDto updated = service.updateProfile(operator, new UpdateProfileRequest("  New Name ", " "));
        assertThat(updated.displayName()).isEqualTo("New Name");
        assertThat(updated.email()).isNull();

        assertThatThrownBy(() -> service.changePassword(operator, new ChangePasswordRequest("nope", "password-2")))
                .isInstanceOf(UnauthorizedException.class);
        service.changePassword(operator, new ChangePasswordRequest("password-1", "password-2"));
        assertThat(service.login(new LoginRequest("operator", "password-2")).operator().displayName()).isEqualTo("New Name");
    }

    @Test
    void avatarIsStoredByDetectedTypeReplacedAndRemoved() {
        SessionDto session = service.register(new RegisterRequest("operator", "password-1", "Operator", null));
        OperatorEntity operator = service.authenticate(session.token());

        OperatorDto withPhoto = service.replaceAvatar(operator, "application/octet-stream", PNG);
        assertThat(withPhoto.avatarUpdatedAt()).isEqualTo(NOW);
        assertThat(service.findAvatar(operator)).get()
                .satisfies(avatar -> assertThat(avatar.getContentType()).isEqualTo("image/png"));

        clock.advance(Duration.ofMinutes(5));
        byte[] jpeg = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 0, 16};
        assertThat(service.replaceAvatar(operator, "image/jpeg", jpeg).avatarUpdatedAt()).isEqualTo(NOW.plus(Duration.ofMinutes(5)));
        assertThat(avatars.count()).isEqualTo(1);

        assertThat(service.removeAvatar(operator).avatarUpdatedAt()).isNull();
        assertThat(service.findAvatar(operator)).isEmpty();
    }

    @Test
    void avatarRejectsNonImagesAndOversizedFiles() {
        SessionDto session = service.register(new RegisterRequest("operator", "password-1", "Operator", null));
        OperatorEntity operator = service.authenticate(session.token());

        assertThatThrownBy(() -> service.replaceAvatar(operator, "image/png", "<svg/>".getBytes()))
                .isInstanceOf(InvalidAvatarException.class)
                .satisfies(ex -> assertThat(((InvalidAvatarException) ex).isTooLarge()).isFalse());

        byte[] huge = new byte[2048];
        System.arraycopy(PNG, 0, huge, 0, PNG.length);
        assertThatThrownBy(() -> service.replaceAvatar(operator, "image/png", huge))
                .isInstanceOf(InvalidAvatarException.class)
                .satisfies(ex -> assertThat(((InvalidAvatarException) ex).isTooLarge()).isTrue());
    }

    private static final class MutableClock extends Clock {
        private Instant now;

        MutableClock(Instant now) {
            this.now = now;
        }

        void advance(Duration duration) {
            now = now.plus(duration);
        }

        @Override
        public ZoneOffset getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(java.time.ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }
}
