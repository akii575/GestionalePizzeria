package it.pizzeria.gestionale.auth;

import com.google.firebase.auth.FirebaseAuthException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.time.Duration;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class FirebaseAuthController {

    private final FirebaseAdminAuth firebaseAdminAuth;
    private final String projectId;
    private final String webApiKey;
    private final String authDomain;
    private final String appId;

    public FirebaseAuthController(
            FirebaseAdminAuth firebaseAdminAuth,
            @Value("${firebase.project-id}") String projectId,
            @Value("${firebase.web-api-key}") String webApiKey,
            @Value("${firebase.auth-domain}") String authDomain,
            @Value("${firebase.app-id}") String appId
    ) {
        this.firebaseAdminAuth = firebaseAdminAuth;
        this.projectId = projectId;
        this.webApiKey = webApiKey;
        this.authDomain = authDomain;
        this.appId = appId;
    }

    @GetMapping("/config")
    public ResponseEntity<Map<String, String>> firebaseConfig() {
        if (projectId.isBlank() || webApiKey.isBlank() || authDomain.isBlank() || appId.isBlank()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Configurazione Firebase incompleta.");
        }
        return ResponseEntity.ok()
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(Map.of(
                        "projectId", projectId,
                        "apiKey", webApiKey,
                        "authDomain", authDomain,
                        "appId", appId
                ));
    }

    @PostMapping("/auth/session")
    public ResponseEntity<Void> createSession(
            @RequestBody SessionRequest request,
            HttpServletRequest httpRequest
    ) throws FirebaseAuthException, IOException {
        requireSameOrigin(httpRequest);
        if (request == null || request.idToken() == null || request.idToken().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Token di accesso mancante.");
        }

        Map<String, Object> claims;
        try {
            claims = firebaseAdminAuth.verifyIdToken(request.idToken());
        } catch (FirebaseAuthException exception) {
            if (FirebaseAdminAuth.isInvalidCredential(exception)) {
                throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Credenziali non valide.");
            }
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Autenticazione non disponibile.");
        } catch (IOException exception) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Autenticazione non disponibile.");
        }
        if (!FirebaseAdminAuth.isAdmin(claims)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Accesso negato.");
        }

        String cookie;
        try {
            cookie = firebaseAdminAuth.createSessionCookie(request.idToken());
        } catch (FirebaseAuthException | IOException exception) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Autenticazione non disponibile.");
        }
        ResponseCookie sessionCookie = ResponseCookie.from("__Host-session", cookie)
                .httpOnly(true)
                .secure(true)
                .path("/")
                .sameSite("Lax")
                .maxAge(Duration.ofDays(5))
                .build();
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, sessionCookie.toString())
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .build();
    }

    @GetMapping("/auth/verify")
    public ResponseEntity<Map<String, Object>> verifySession(HttpServletRequest request) {
        Object email = request.getAttribute(FirebaseAdminFilter.ADMIN_EMAIL_ATTRIBUTE);
        return ResponseEntity.ok()
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(Map.of("admin", true, "email", email));
    }

    @PostMapping("/auth/logout")
    public ResponseEntity<Void> logout(HttpServletRequest request) {
        requireSameOrigin(request);
        ResponseCookie sessionCookie = ResponseCookie.from("__Host-session", "")
                .httpOnly(true)
                .secure(true)
                .path("/")
                .sameSite("Lax")
                .maxAge(Duration.ZERO)
                .build();
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, sessionCookie.toString())
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .build();
    }

    private static void requireSameOrigin(HttpServletRequest request) {
        if (!FirebaseAdminFilter.sameOrigin(request)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Origine della richiesta non valida.");
        }
    }

    public record SessionRequest(String idToken) {
    }
}
