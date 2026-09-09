package com.uop.backend.security;

import java.io.IOException;
import java.util.List;

import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;

/**
 * Filter that protects all /internal/** endpoints with a pre-shared X-Internal-API-Key header.
 * Keeps internal Flask-to-Spring security isolated from administrator JWT authentication.
 */
@Slf4j
public class InternalApiKeyAuthFilter extends OncePerRequestFilter {

    public static final String HEADER_NAME = "X-Internal-API-Key";

    private final String configuredApiKey;

    public InternalApiKeyAuthFilter(String configuredApiKey) {
        this.configuredApiKey = configuredApiKey != null ? configuredApiKey.trim() : "";
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {

        String path = request.getRequestURI();
        String contextPath = request.getContextPath();
        if (contextPath != null && !contextPath.isEmpty() && path.startsWith(contextPath)) {
            path = path.substring(contextPath.length());
        }

        // Apply only to /internal/** endpoints
        if (!path.startsWith("/internal")) {
            filterChain.doFilter(request, response);
            return;
        }

        String providedKey = request.getHeader(HEADER_NAME);

        if (providedKey == null || providedKey.isBlank() || !providedKey.trim().equals(configuredApiKey)) {
            log.warn("Unauthorized attempt to access internal endpoint: path={}, ip={}", path, request.getRemoteAddr());
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType("application/json");
            response.setCharacterEncoding("UTF-8");
            response.getWriter().write("{\"error\":\"Unauthorized\",\"message\":\"Invalid or missing internal API key\"}");
            return;
        }

        // Establish an internal service authentication context
        UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
                "INTERNAL_SERVICE",
                null,
                List.of(new SimpleGrantedAuthority("ROLE_INTERNAL"))
        );
        SecurityContextHolder.getContext().setAuthentication(authentication);

        filterChain.doFilter(request, response);
    }
}
