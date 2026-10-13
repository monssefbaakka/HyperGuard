package com.pulsestream.query.config;

import com.pulsestream.query.security.ApiAuthenticationInterceptor;
import com.pulsestream.query.service.AuthService;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Cross-origin access and session enforcement for the API.
 *
 * <p>The web UI is served from its own origin (the Vite dev server, or the UI container), so the
 * API opts those origins in explicitly — only the origins listed in
 * {@code pulsestream.query.cors-allowed-origins}. The session travels as a bearer header rather than a
 * cookie, so credentials are not enabled for CORS.
 *
 * <p>Every {@code /api/v1} route except {@code /api/v1/auth/**} requires a signed-in operator; the auth
 * routes authenticate {@code /me} themselves and must stay reachable to sign in. The interceptor is
 * registered whenever {@link AuthService} exists, which is always in the running service; web-layer
 * slice tests that do not provide it exercise their controller alone.
 */
@Configuration
public class WebConfiguration implements WebMvcConfigurer {

    private final QueryProperties properties;
    private final ObjectProvider<AuthService> authService;

    public WebConfiguration(QueryProperties properties, ObjectProvider<AuthService> authService) {
        this.properties = properties;
        this.authService = authService;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        AuthService service = authService.getIfAvailable();
        if (service == null) {
            return;
        }
        registry.addInterceptor(new ApiAuthenticationInterceptor(service))
                .addPathPatterns("/api/v1/**")
                .excludePathPatterns("/api/v1/auth/**");
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        if (properties.corsAllowedOrigins().isEmpty()) {
            return;
        }

        String[] origins = properties.corsAllowedOrigins().toArray(String[]::new);

        registry.addMapping("/api/**")
                .allowedOrigins(origins)
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                .allowedHeaders("Content-Type", "Authorization")
                .maxAge(3600);
    }
}
