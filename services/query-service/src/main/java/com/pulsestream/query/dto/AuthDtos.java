package com.pulsestream.query.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;

/** Request and response bodies of {@code /api/v1/auth}. */
public final class AuthDtos {

    private AuthDtos() {
    }

    public record RegisterRequest(
            @NotBlank
            @Pattern(regexp = "^[A-Za-z0-9._-]{3,50}$",
                    message = "3 to 50 characters: letters, digits, dot, dash or underscore")
            String username,
            // BCrypt only reads the first 72 bytes, so a longer password would silently lose its tail.
            @NotBlank @Size(min = 8, max = 72, message = "must be between 8 and 72 characters") String password,
            @NotBlank @Size(max = 100) String displayName,
            @Email @Size(max = 254) String email) {
    }

    public record LoginRequest(@NotBlank String username, @NotBlank String password) {
    }

    public record UpdateProfileRequest(
            @NotBlank @Size(max = 100) String displayName,
            @Email @Size(max = 254) String email) {
    }

    public record ChangePasswordRequest(
            @NotBlank String currentPassword,
            @NotBlank @Size(min = 8, max = 72, message = "must be between 8 and 72 characters") String newPassword) {
    }

    /**
     * @param avatarUpdatedAt when the photo last changed, or absent when there is none; the console
     *                        uses it to know when to fetch the image again
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record OperatorDto(
            Long id,
            String username,
            String displayName,
            String email,
            Instant createdAt,
            Instant avatarUpdatedAt) {
    }

    public record SessionDto(String token, Instant expiresAt, OperatorDto operator) {
    }
}
