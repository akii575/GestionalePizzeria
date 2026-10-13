package it.pizzeria.gestionale.auth;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class FirebaseAuthControllerTest {

    private final FirebaseAdminAuth firebaseAdminAuth = mock(FirebaseAdminAuth.class);
    private final FirebaseAuthController controller = new FirebaseAuthController(
            firebaseAdminAuth,
            "project",
            "web-api-key",
            "project.firebaseapp.com",
            "app-id"
    );

    @Test
    void loginDoesNotIssueSessionCookieToAuthenticatedNonAdmin() throws Exception {
        when(firebaseAdminAuth.verifyIdToken("valid-non-admin-token"))
                .thenReturn(Map.of("admin", false));
        MockHttpServletRequest request = sameOriginRequest();

        ResponseStatusException error = assertThrows(
                ResponseStatusException.class,
                () -> controller.createSession(
                        new FirebaseAuthController.SessionRequest("valid-non-admin-token"),
                        request
                )
        );

        assertEquals(HttpStatus.FORBIDDEN, error.getStatusCode());
        verify(firebaseAdminAuth, never()).createSessionCookie("valid-non-admin-token");
    }

    @Test
    void loginIssuesHttpOnlySecureSessionCookieOnlyToAdmin() throws Exception {
        when(firebaseAdminAuth.verifyIdToken("valid-admin-token"))
                .thenReturn(Map.of("admin", true));
        when(firebaseAdminAuth.createSessionCookie("valid-admin-token"))
                .thenReturn("signed-session-cookie");

        var response = controller.createSession(
                new FirebaseAuthController.SessionRequest("valid-admin-token"),
                sameOriginRequest()
        );

        assertEquals(HttpStatus.NO_CONTENT, response.getStatusCode());
        String cookie = response.getHeaders().getFirst("Set-Cookie");
        assertTrue(cookie.contains("HttpOnly"));
        assertTrue(cookie.contains("Secure"));
        assertTrue(cookie.contains("SameSite=Lax"));
        assertTrue(cookie.contains("__Host-session="));
    }

    @Test
    void loginRejectsCrossOriginSessionCreation() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/auth/session");
        request.setScheme("http");
        request.setServerName("localhost");
        request.setServerPort(8080);
        request.addHeader("Origin", "https://attacker.example");

        ResponseStatusException error = assertThrows(
                ResponseStatusException.class,
                () -> controller.createSession(
                        new FirebaseAuthController.SessionRequest("valid-admin-token"),
                        request
                )
        );

        assertEquals(HttpStatus.FORBIDDEN, error.getStatusCode());
        verify(firebaseAdminAuth, never()).verifyIdToken("valid-admin-token");
    }

    private static MockHttpServletRequest sameOriginRequest() {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/auth/session");
        request.setScheme("http");
        request.setServerName("localhost");
        request.setServerPort(8080);
        request.addHeader("Origin", "http://localhost:8080");
        return request;
    }
}
