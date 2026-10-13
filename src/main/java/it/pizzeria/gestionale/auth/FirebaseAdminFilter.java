package it.pizzeria.gestionale.auth;

import com.google.firebase.auth.FirebaseAuthException;
import com.google.firebase.auth.AuthErrorCode;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.net.URI;
import java.util.Map;
import java.util.Set;

@Component
public class FirebaseAdminFilter extends OncePerRequestFilter {

    private static final Logger logger = LoggerFactory.getLogger(FirebaseAdminFilter.class);
    public static final String ADMIN_EMAIL_ATTRIBUTE = FirebaseAdminFilter.class.getName() + ".email";
    private static final String SESSION_COOKIE = "__Host-session";
    private static final Set<String> PUBLIC_PATHS = Set.of(
            "/login.html",
            "/login.js",
            "/auth.css",
            "/auth-logout.js",
            "/api/config",
            "/api/auth/session",
            "/api/auth/logout"
    );
    private static final String DENIED_PAGE = """
            <!doctype html><html lang="it"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
            <title>Accesso negato</title><body><main><h1>Accesso negato</h1><p>Questo account non è autorizzato.</p>
            <button id="logout" type="button">Esci</button></main><script src="/auth-logout.js"></script></body></html>
            """;

    private final FirebaseAdminAuth firebaseAdminAuth;

    public FirebaseAdminFilter(FirebaseAdminAuth firebaseAdminAuth) {
        this.firebaseAdminAuth = firebaseAdminAuth;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return PUBLIC_PATHS.contains(path(request));
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        protectResponse(response);
        String sessionCookie = sessionCookie(request);
        if (sessionCookie == null) {
            reject(request, response, HttpServletResponse.SC_UNAUTHORIZED, "Autenticazione richiesta.");
            return;
        }

        Map<String, Object> claims;
        try {
            claims = firebaseAdminAuth.verifySessionCookie(sessionCookie);
        } catch (IllegalStateException exception) {
            response.setStatus(HttpServletResponse.SC_SERVICE_UNAVAILABLE);
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write("{\"errore\":\"Autenticazione non disponibile.\"}");
            return;
        } catch (FirebaseAuthException exception) {
            if (FirebaseAdminAuth.isInvalidCredential(exception)) {
                reject(request, response, HttpServletResponse.SC_UNAUTHORIZED, "Sessione non valida o scaduta.");
            } else {
                AuthErrorCode errorCode = exception.getAuthErrorCode();
                logger.warn("Firebase session verification failed: {}", errorCode);
                response.setStatus(HttpServletResponse.SC_SERVICE_UNAVAILABLE);
                response.setContentType("application/json;charset=UTF-8");
                response.getWriter().write("{\"errore\":\"Autenticazione non disponibile.\"}");
            }
            return;
        } catch (IOException exception) {
            response.setStatus(HttpServletResponse.SC_SERVICE_UNAVAILABLE);
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write("{\"errore\":\"Autenticazione non disponibile.\"}");
            return;
        }
        if (!FirebaseAdminAuth.isAdmin(claims)) {
            reject(request, response, HttpServletResponse.SC_FORBIDDEN, "Accesso negato.");
            return;
        }
        if (isUnsafeMethod(request.getMethod()) && !sameOrigin(request)) {
            reject(request, response, HttpServletResponse.SC_FORBIDDEN, "Origine della richiesta non valida.");
            return;
        }
        Object email = claims.get("email");
        request.setAttribute(ADMIN_EMAIL_ATTRIBUTE, email instanceof String ? email : "");
        filterChain.doFilter(request, response);
    }

    private static String sessionCookie(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return null;
        }
        for (Cookie cookie : cookies) {
            if (SESSION_COOKIE.equals(cookie.getName()) && !cookie.getValue().isBlank()) {
                return cookie.getValue();
            }
        }
        return null;
    }

    private static boolean isUnsafeMethod(String method) {
        return Set.of("POST", "PUT", "PATCH", "DELETE").contains(method);
    }

    public static boolean sameOrigin(HttpServletRequest request) {
        String origin = request.getHeader("Origin");
        if (origin == null || origin.isBlank()) {
            return false;
        }
        try {
            URI uri = URI.create(origin);
            if (uri.getHost() == null || uri.getUserInfo() != null || uri.getQuery() != null
                    || uri.getFragment() != null || (uri.getPath() != null && !uri.getPath().isEmpty()
                    && !uri.getPath().equals("/"))) {
                return false;
            }
            int originPort = uri.getPort() == -1 ? defaultPort(uri.getScheme()) : uri.getPort();
            int requestPort = request.getServerPort();
            return uri.getScheme() != null && uri.getScheme().equalsIgnoreCase(request.getScheme())
                    && uri.getHost().equalsIgnoreCase(request.getServerName())
                    && originPort == requestPort;
        } catch (IllegalArgumentException exception) {
            return false;
        }
    }

    private static int defaultPort(String scheme) {
        if ("https".equalsIgnoreCase(scheme)) {
            return 443;
        }
        if ("http".equalsIgnoreCase(scheme)) {
            return 80;
        }
        return -1;
    }

    private static void reject(
            HttpServletRequest request,
            HttpServletResponse response,
            int status,
            String message
    ) throws IOException {
        response.setStatus(status);
        if (!path(request).startsWith("/api/") && status == HttpServletResponse.SC_UNAUTHORIZED) {
            response.sendRedirect("/login.html");
            return;
        }
        if (status == HttpServletResponse.SC_FORBIDDEN && !path(request).startsWith("/api/")) {
            response.setContentType("text/html;charset=UTF-8");
            response.getWriter().write(DENIED_PAGE);
            return;
        }
        response.setContentType("application/json;charset=UTF-8");
        response.getWriter().write("{\"errore\":\"" + message + "\"}");
    }

    private static void protectResponse(HttpServletResponse response) {
        response.setHeader("Cache-Control", "private, no-store");
        response.setHeader("Content-Security-Policy",
                "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
                        + "connect-src 'self' https://identitytoolkit.googleapis.com; img-src 'self' data:; "
                        + "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
        response.setHeader("X-Frame-Options", "DENY");
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("Referrer-Policy", "same-origin");
        response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    }

    private static String path(HttpServletRequest request) {
        String contextPath = request.getContextPath();
        return request.getRequestURI().substring(contextPath.length());
    }
}
