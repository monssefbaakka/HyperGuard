package com.pulsestream.query.controller;

import com.pulsestream.query.config.QueryProperties;
import com.pulsestream.query.dto.AuthDtos.OperatorDto;
import com.pulsestream.query.dto.AuthDtos.SessionDto;
import com.pulsestream.query.exception.AuthExceptions.UnauthorizedException;
import com.pulsestream.query.model.OperatorAvatarEntity;
import com.pulsestream.query.model.OperatorEntity;
import com.pulsestream.query.service.AuthService;
import java.time.Instant;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(AuthController.class)
@EnableConfigurationProperties(QueryProperties.class)
class AuthControllerTest {

    private static final OperatorDto OPERATOR =
            new OperatorDto(1L, "monssef", "Monssef", null, Instant.parse("2026-09-13T10:00:00Z"), null);

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private AuthService authService;

    @Test
    void registerReturns201WithTheSession() throws Exception {
        when(authService.register(any())).thenReturn(new SessionDto("token-1", Instant.parse("2026-09-13T22:00:00Z"), OPERATOR));

        mockMvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"monssef\",\"password\":\"password-1\",\"displayName\":\"Monssef\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.token").value("token-1"))
                .andExpect(jsonPath("$.operator.username").value("monssef"));
    }

    @Test
    void registerValidatesTheBody() throws Exception {
        mockMvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"a b\",\"password\":\"short\",\"displayName\":\"\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.length()").value(3));

        verify(authService, never()).register(any());
    }

    @Test
    void meWithoutATokenIs401() throws Exception {
        when(authService.authenticate(null)).thenThrow(new UnauthorizedException("Sign in to continue."));

        mockMvc.perform(get("/api/v1/auth/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Sign in to continue."));
    }

    @Test
    void meReadsTheBearerToken() throws Exception {
        OperatorEntity entity = mock(OperatorEntity.class);
        when(authService.authenticate("abc")).thenReturn(entity);
        when(authService.describe(entity)).thenReturn(OPERATOR);

        mockMvc.perform(get("/api/v1/auth/me").header("Authorization", "Bearer abc"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.displayName").value("Monssef"));
    }

    @Test
    void avatarUploadPassesTheBytesAndTheAvatarIsServedBack() throws Exception {
        OperatorEntity entity = mock(OperatorEntity.class);
        byte[] png = {(byte) 0x89, 'P', 'N', 'G', 1, 2, 3, 4};
        when(authService.authenticate("abc")).thenReturn(entity);
        when(authService.replaceAvatar(eq(entity), eq("image/png"), any())).thenReturn(OPERATOR);
        when(authService.findAvatar(entity))
                .thenReturn(Optional.of(new OperatorAvatarEntity(1L, "image/png", png, Instant.now())));

        mockMvc.perform(multipart("/api/v1/auth/me/avatar")
                        .file(new MockMultipartFile("file", "me.png", "image/png", png))
                        .with(request -> {
                            request.setMethod("PUT");
                            return request;
                        })
                        .header("Authorization", "Bearer abc"))
                .andExpect(status().isOk());
        verify(authService).replaceAvatar(entity, "image/png", png);

        mockMvc.perform(get("/api/v1/auth/me/avatar").header("Authorization", "Bearer abc"))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "image/png"))
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(content().bytes(png));
    }
}
