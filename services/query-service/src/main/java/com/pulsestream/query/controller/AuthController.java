package com.pulsestream.query.controller;

import com.pulsestream.query.dto.AuthDtos.ChangePasswordRequest;
import com.pulsestream.query.dto.AuthDtos.LoginRequest;
import com.pulsestream.query.dto.AuthDtos.OperatorDto;
import com.pulsestream.query.dto.AuthDtos.RegisterRequest;
import com.pulsestream.query.dto.AuthDtos.SessionDto;
import com.pulsestream.query.dto.AuthDtos.UpdateProfileRequest;
import com.pulsestream.query.model.OperatorAvatarEntity;
import com.pulsestream.query.service.AuthService;
import jakarta.validation.Valid;
import java.io.IOException;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * Console sign-in and the signed-in operator's own profile.
 *
 * <p>Every {@code /me} route expects {@code Authorization: Bearer <token>} as returned by register or
 * login. Every other {@code /api/v1} route requires the same header, enforced by
 * {@link com.pulsestream.query.security.ApiAuthenticationInterceptor}.
 */
@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public SessionDto register(@Valid @RequestBody RegisterRequest request) {
        return authService.register(request);
    }

    @PostMapping("/login")
    public SessionDto login(@Valid @RequestBody LoginRequest request) {
        return authService.login(request);
    }

    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout(@RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorization) {
        authService.logout(bearer(authorization));
    }

    @GetMapping("/me")
    public OperatorDto me(@RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorization) {
        return authService.describe(authService.authenticate(bearer(authorization)));
    }

    @PutMapping("/me")
    public OperatorDto updateProfile(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorization,
            @Valid @RequestBody UpdateProfileRequest request) {
        return authService.updateProfile(authService.authenticate(bearer(authorization)), request);
    }

    @PutMapping("/me/password")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void changePassword(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorization,
            @Valid @RequestBody ChangePasswordRequest request) {
        authService.changePassword(authService.authenticate(bearer(authorization)), request);
    }

    @PutMapping(path = "/me/avatar", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public OperatorDto uploadAvatar(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorization,
            @RequestPart("file") MultipartFile file) throws IOException {
        return authService.replaceAvatar(
                authService.authenticate(bearer(authorization)), file.getContentType(), file.getBytes());
    }

    @GetMapping("/me/avatar")
    public ResponseEntity<byte[]> avatar(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorization) {
        return authService.findAvatar(authService.authenticate(bearer(authorization)))
                .map(AuthController::imageResponse)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @DeleteMapping("/me/avatar")
    public OperatorDto removeAvatar(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorization) {
        return authService.removeAvatar(authService.authenticate(bearer(authorization)));
    }

    private static ResponseEntity<byte[]> imageResponse(OperatorAvatarEntity avatar) {
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(avatar.getContentType()))
                // The photo is private to its owner; never let a shared cache keep it.
                .cacheControl(CacheControl.noStore())
                .body(avatar.getData());
    }

    private static String bearer(String authorization) {
        if (authorization == null) {
            return null;
        }
        String value = authorization.trim();
        return value.regionMatches(true, 0, "Bearer ", 0, 7) ? value.substring(7).trim() : null;
    }
}
