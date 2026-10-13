package it.pizzeria.gestionale.auth;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.auth.AuthErrorCode;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;
import com.google.firebase.auth.FirebaseToken;
import com.google.firebase.auth.SessionCookieOptions;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Map;
import java.util.Set;

@Service
public class FirebaseAdminAuth {

    private volatile FirebaseAuth firebaseAuth;

    public Map<String, Object> verifyIdToken(String idToken) throws FirebaseAuthException, IOException {
        return auth().verifyIdToken(idToken, true).getClaims();
    }

    public Map<String, Object> verifySessionCookie(String sessionCookie) throws FirebaseAuthException, IOException {
        return auth().verifySessionCookie(sessionCookie, true).getClaims();
    }

    public String createSessionCookie(String idToken) throws FirebaseAuthException, IOException {
        return auth().createSessionCookie(
                idToken,
                SessionCookieOptions.builder().setExpiresIn(Duration.ofDays(5).toMillis()).build()
        );
    }

    private FirebaseAuth auth() throws IOException {
        FirebaseAuth current = firebaseAuth;
        if (current != null) {
            return current;
        }
        synchronized (this) {
            if (firebaseAuth != null) {
                return firebaseAuth;
            }
            String projectId = System.getenv("FIREBASE_PROJECT_ID");
            if (projectId == null || projectId.isBlank()) {
                throw new IllegalStateException("Firebase project configuration is missing.");
            }

            String serviceAccountJson = System.getenv("FIREBASE_SERVICE_ACCOUNT_JSON");
            String credentialsPath = System.getenv("GOOGLE_APPLICATION_CREDENTIALS");
            GoogleCredentials credentials;
            if (serviceAccountJson != null && !serviceAccountJson.isBlank()) {
                credentials = GoogleCredentials.fromStream(new ByteArrayInputStream(
                        serviceAccountJson.getBytes(StandardCharsets.UTF_8)
                ));
            } else if (credentialsPath != null && !credentialsPath.isBlank()) {
                try (var input = Files.newInputStream(Path.of(credentialsPath))) {
                    credentials = GoogleCredentials.fromStream(input);
                }
            } else {
                throw new IllegalStateException("Firebase Admin credentials are not configured.");
            }

            FirebaseOptions options = FirebaseOptions.builder()
                    .setCredentials(credentials)
                    .setProjectId(projectId)
                    .build();
            FirebaseApp app = FirebaseApp.getApps().stream()
                    .filter(candidate -> candidate.getName().equals(FirebaseApp.DEFAULT_APP_NAME))
                    .findFirst()
                    .orElseGet(() -> FirebaseApp.initializeApp(options));
            firebaseAuth = FirebaseAuth.getInstance(app);
            return firebaseAuth;
        }
    }

    public static boolean isAdmin(Map<String, Object> claims) {
        return Boolean.TRUE.equals(claims.get("admin"));
    }

    public static boolean isInvalidCredential(FirebaseAuthException exception) {
        return Set.of(
                AuthErrorCode.EXPIRED_ID_TOKEN,
                AuthErrorCode.EXPIRED_SESSION_COOKIE,
                AuthErrorCode.INVALID_ID_TOKEN,
                AuthErrorCode.INVALID_SESSION_COOKIE,
                AuthErrorCode.REVOKED_ID_TOKEN,
                AuthErrorCode.REVOKED_SESSION_COOKIE,
                AuthErrorCode.USER_DISABLED,
                AuthErrorCode.USER_NOT_FOUND
        ).contains(exception.getAuthErrorCode());
    }
}
