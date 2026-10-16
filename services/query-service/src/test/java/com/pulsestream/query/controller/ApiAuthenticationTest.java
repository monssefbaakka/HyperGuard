package com.pulsestream.query.controller;

import com.pulsestream.query.config.QueryProperties;
import com.pulsestream.query.dto.AuthDtos.SessionDto;
import com.pulsestream.query.dto.IncidentDtos.IncidentDto;
import com.pulsestream.query.dto.PageResponseDto;
import com.pulsestream.query.exception.AuthExceptions.UnauthorizedException;
import com.pulsestream.query.exception.ResourceExceptions.StateConflictException;
import com.pulsestream.query.model.OperatorEntity;
import com.pulsestream.query.service.AuthService;
import com.pulsestream.query.service.IncidentService;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The session gate in front of the API, exercised through the incident endpoints: with
 * {@link AuthService} present, {@code WebConfiguration} registers the interceptor as in production.
 */
@WebMvcTest({IncidentController.class, AuthController.class})
@EnableConfigurationProperties(QueryProperties.class)
class ApiAuthenticationTest {

    private static final OperatorEntity OPERATOR =
            new OperatorEntity("monssef", "hash", "Monssef", null, Instant.parse("2026-09-15T10:00:00Z"));

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private AuthService authService;

    @MockBean
    private IncidentService incidentService;

    @Test
    void aRequestWithoutATokenIsRejectedWith401() throws Exception {
        when(authService.authenticate(isNull())).thenThrow(new UnauthorizedException("Sign in to continue."));

        mockMvc.perform(get("/api/v1/incidents"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Sign in to continue."));

        verify(incidentService, never()).search(any(), any(), any(), any(), anyInt(), anyInt());
    }

    @Test
    void aRevokedTokenIsRejectedWith401() throws Exception {
        when(authService.authenticate("stale")).thenThrow(new UnauthorizedException("Your session has expired. Sign in again."));

        mockMvc.perform(get("/api/v1/incidents").header(HttpHeaders.AUTHORIZATION, "Bearer stale"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void aValidTokenReachesTheEndpoint() throws Exception {
        when(authService.authenticate("good")).thenReturn(OPERATOR);
        when(incidentService.search(any(), any(), eq("ACTIVE"), any(), anyInt(), anyInt()))
                .thenReturn(new PageResponseDto<>(List.of(), 0, 50, 0, 0, false));

        mockMvc.perform(get("/api/v1/incidents").param("status", "ACTIVE").header(HttpHeaders.AUTHORIZATION, "Bearer good"))
                .andExpect(status().isOk());
    }

    @Test
    void writeEndpointsActAsTheSignedInOperator() throws Exception {
        when(authService.authenticate("good")).thenReturn(OPERATOR);
        when(incidentService.resolve(7L, "fan replaced", OPERATOR)).thenReturn(incident("RESOLVED"));

        mockMvc.perform(post("/api/v1/incidents/7/resolve")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer good")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"note\":\"fan replaced\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("RESOLVED"))
                .andExpect(jsonPath("$.resolvedBy").value("monssef"));
    }

    @Test
    void resolvingWithoutANoteIsABadRequest() throws Exception {
        when(authService.authenticate("good")).thenReturn(OPERATOR);

        mockMvc.perform(post("/api/v1/incidents/7/resolve")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer good")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"note\":\"  \"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void anInvalidTransitionIsA409() throws Exception {
        when(authService.authenticate("good")).thenReturn(OPERATOR);
        when(incidentService.acknowledge(7L, OPERATOR)).thenThrow(new StateConflictException("This incident is already resolved."));

        mockMvc.perform(post("/api/v1/incidents/7/acknowledge").header(HttpHeaders.AUTHORIZATION, "Bearer good"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("This incident is already resolved."));
    }

    @Test
    void signInStaysReachableWithoutAToken() throws Exception {
        when(authService.login(any())).thenReturn(new SessionDto("token", Instant.parse("2026-09-15T22:00:00Z"), null));

        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"monssef\",\"password\":\"password-1\"}"))
                .andExpect(status().isOk());

        verify(authService, never()).authenticate(any());
    }

    @Test
    void corsPreflightIsNotAuthenticated() throws Exception {
        mockMvc.perform(options("/api/v1/incidents")
                        .header(HttpHeaders.ORIGIN, "http://localhost:5173")
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "POST"))
                .andExpect(status().isOk());

        verify(authService, never()).authenticate(any());
    }

    private static IncidentDto incident(String status) {
        return new IncidentDto(7L, "tenant-a", "device-1", status, "CRITICAL", 3, List.of("temperature"),
                new BigDecimal("96"), new BigDecimal("80"), Instant.parse("2026-09-15T10:00:00Z"),
                Instant.parse("2026-09-15T10:10:00Z"), Instant.parse("2026-09-15T10:20:00Z"), "monssef",
                Instant.parse("2026-09-15T10:30:00Z"), "monssef", "fan replaced", false);
    }
}
