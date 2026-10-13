package com.pulsestream.query.security;

import com.pulsestream.query.model.OperatorEntity;
import com.pulsestream.query.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.web.cors.CorsUtils;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * Requires a valid console session on every {@code /api/v1} route except sign-in itself.
 *
 * <p>The resolved operator is left on the request under {@link #OPERATOR_ATTRIBUTE}, so write
 * endpoints can record who acted without authenticating a second time. A missing, expired or revoked
 * token fails with 401 through the global exception handler, in the platform's usual error body.
 * CORS preflight requests carry no credentials by design and are let through.
 */
public class ApiAuthenticationInterceptor implements HandlerInterceptor {

    public static final String OPERATOR_ATTRIBUTE = "pulsestream.operator";

    private final AuthService authService;

    public ApiAuthenticationInterceptor(AuthService authService) {
        this.authService = authService;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if (CorsUtils.isPreFlightRequest(request)) {
            return true;
        }
        OperatorEntity operator = authService.authenticate(bearerToken(request.getHeader(HttpHeaders.AUTHORIZATION)));
        request.setAttribute(OPERATOR_ATTRIBUTE, operator);
        return true;
    }

    public static String bearerToken(String authorization) {
        if (authorization == null) {
            return null;
        }
        String value = authorization.trim();
        return value.regionMatches(true, 0, "Bearer ", 0, 7) ? value.substring(7).trim() : null;
    }
}
