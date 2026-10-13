package it.pizzeria.gestionale.auth;

import com.google.firebase.auth.FirebaseAuthException;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class FirebaseAdminFilterTest {

    private final FirebaseAdminAuth firebaseAdminAuth = mock(FirebaseAdminAuth.class);
    private final FirebaseAdminFilter filter = new FirebaseAdminFilter(firebaseAdminAuth);

    @Test
    void unauthenticatedApiRequestIsRejected() throws Exception {
        MockHttpServletRequest request = request("GET", "/api/ordini");
        MockHttpServletResponse response = new MockHttpServletResponse();
        AtomicBoolean invoked = new AtomicBoolean();

        filter.doFilter(request, response, (servletRequest, servletResponse) -> invoked.set(true));

        assertEquals(401, response.getStatus());
        assertFalse(invoked.get());
        verify(firebaseAdminAuth, never()).verifySessionCookie(org.mockito.ArgumentMatchers.anyString());
    }

    @Test
    void unauthenticatedPageRedirectsToLogin() throws Exception {
        MockHttpServletRequest request = request("GET", "/");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, (servletRequest, servletResponse) -> {
            throw new AssertionError("Protected page must not be served.");
        });

        assertEquals(302, response.getStatus());
        assertEquals("/login.html", response.getRedirectedUrl());
    }

    @Test
    void authenticatedNonAdminCannotReadApiOrProtectedPages() throws Exception {
        when(firebaseAdminAuth.verifySessionCookie("non-admin"))
                .thenReturn(Map.of("admin", false));
        MockHttpServletRequest apiRequest = request("GET", "/api/ordini");
        apiRequest.setCookies(new jakarta.servlet.http.Cookie("__Host-session", "non-admin"));
        MockHttpServletResponse apiResponse = new MockHttpServletResponse();
        AtomicBoolean apiInvoked = new AtomicBoolean();

        filter.doFilter(apiRequest, apiResponse, (servletRequest, servletResponse) -> apiInvoked.set(true));

        assertEquals(403, apiResponse.getStatus());
        assertFalse(apiInvoked.get());

        MockHttpServletRequest pageRequest = request("GET", "/");
        pageRequest.setCookies(new jakarta.servlet.http.Cookie("__Host-session", "non-admin"));
        MockHttpServletResponse pageResponse = new MockHttpServletResponse();
        AtomicBoolean pageInvoked = new AtomicBoolean();

        filter.doFilter(pageRequest, pageResponse, (servletRequest, servletResponse) -> pageInvoked.set(true));

        assertEquals(403, pageResponse.getStatus());
        assertTrue(pageResponse.getContentAsString().contains("Accesso negato"));
        assertFalse(pageInvoked.get());
    }

    @Test
    void adminCanReadApiWithVerifiedSession() throws Exception {
        when(firebaseAdminAuth.verifySessionCookie("admin-session"))
                .thenReturn(Map.of("admin", true, "email", "admin@example.com"));
        MockHttpServletRequest request = request("GET", "/api/ordini");
        request.setCookies(new jakarta.servlet.http.Cookie("__Host-session", "admin-session"));
        MockHttpServletResponse response = new MockHttpServletResponse();
        AtomicBoolean invoked = new AtomicBoolean();

        filter.doFilter(request, response, (servletRequest, servletResponse) -> invoked.set(true));

        assertTrue(invoked.get());
        assertEquals("admin@example.com", request.getAttribute(FirebaseAdminFilter.ADMIN_EMAIL_ATTRIBUTE));
    }

    @Test
    void unsafeAdminRequestRequiresSameOrigin() throws Exception {
        when(firebaseAdminAuth.verifySessionCookie("admin-session"))
                .thenReturn(Map.of("admin", true));
        MockHttpServletRequest request = request("DELETE", "/api/ordini/1");
        request.setCookies(new jakarta.servlet.http.Cookie("__Host-session", "admin-session"));
        MockHttpServletResponse response = new MockHttpServletResponse();
        AtomicBoolean invoked = new AtomicBoolean();

        filter.doFilter(request, response, (servletRequest, servletResponse) -> invoked.set(true));

        assertEquals(403, response.getStatus());
        assertFalse(invoked.get());
    }

    @Test
    void unsafeAdminRequestFromSameOriginIsAllowed() throws Exception {
        when(firebaseAdminAuth.verifySessionCookie("admin-session"))
                .thenReturn(Map.of("admin", true));
        MockHttpServletRequest request = request("DELETE", "/api/ordini/1");
        request.setCookies(new jakarta.servlet.http.Cookie("__Host-session", "admin-session"));
        request.addHeader("Origin", "http://localhost:8080");
        MockHttpServletResponse response = new MockHttpServletResponse();
        AtomicBoolean invoked = new AtomicBoolean();

        filter.doFilter(request, response, (servletRequest, servletResponse) -> invoked.set(true));

        assertTrue(invoked.get());
    }

    @Test
    void unauthenticatedLoginResourcesRemainPublic() throws Exception {
        MockHttpServletRequest request = request("GET", "/login.html");
        MockHttpServletResponse response = new MockHttpServletResponse();
        AtomicBoolean invoked = new AtomicBoolean();

        filter.doFilter(request, response, (servletRequest, servletResponse) -> invoked.set(true));

        assertTrue(invoked.get());
        verify(firebaseAdminAuth, never()).verifySessionCookie(org.mockito.ArgumentMatchers.anyString());
    }

    @Test
    void invalidSessionIsRejectedWithoutRevealingInternalErrors() throws Exception {
        FirebaseAuthException exception = mock(FirebaseAuthException.class);
        when(exception.getAuthErrorCode()).thenReturn(com.google.firebase.auth.AuthErrorCode.INVALID_SESSION_COOKIE);
        when(firebaseAdminAuth.verifySessionCookie("invalid")).thenThrow(exception);
        MockHttpServletRequest request = request("GET", "/api/ordini");
        request.setCookies(new jakarta.servlet.http.Cookie("__Host-session", "invalid"));
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, (servletRequest, servletResponse) -> {
            throw new AssertionError("Invalid session must not reach the handler.");
        });

        assertEquals(401, response.getStatus());
        assertFalse(response.getContentAsString().contains("invalid"));
    }

    private static MockHttpServletRequest request(String method, String path) {
        MockHttpServletRequest request = new MockHttpServletRequest(method, path);
        request.setScheme("http");
        request.setServerName("localhost");
        request.setServerPort(8080);
        return request;
    }
}
