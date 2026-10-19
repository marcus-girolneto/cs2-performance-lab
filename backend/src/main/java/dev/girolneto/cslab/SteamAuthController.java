package dev.girolneto.cslab;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.*;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/v1/auth")
public class SteamAuthController {
    private static final String PROVIDER = "https://steamcommunity.com/openid/login";
    private static final String NAMESPACE = "http://specs.openid.net/auth/2.0";
    private final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    private final String publicUrl;
    private final SecureRandom random = new SecureRandom();

    public SteamAuthController(@Value("${app.public-url}") String publicUrl) {
        this.publicUrl = publicUrl.replaceAll("/+$", "");
        URI uri = URI.create(this.publicUrl);
        if (uri.getHost() == null || uri.getQuery() != null || uri.getFragment() != null || uri.getUserInfo() != null
            || !(uri.getScheme().equals("https") || (uri.getScheme().equals("http") && Set.of("localhost", "127.0.0.1").contains(uri.getHost())))) {
            throw new IllegalArgumentException("APP_PUBLIC_URL must be an HTTPS origin or local HTTP origin");
        }
    }

    @GetMapping("steam")
    public ResponseEntity<Void> start(HttpServletRequest request) {
        HttpSession session = request.getSession(true);
        String state = token();
        String callback = publicUrl + "/api/v1/auth/steam/callback?state=" + state;
        session.setAttribute("openid.callback", callback);
        session.setAttribute("openid.started", Instant.now());
        var params = new LinkedHashMap<String, String>();
        params.put("openid.ns", NAMESPACE);
        params.put("openid.mode", "checkid_setup");
        params.put("openid.return_to", callback);
        params.put("openid.realm", publicUrl + "/");
        params.put("openid.identity", NAMESPACE + "/identifier_select");
        params.put("openid.claimed_id", NAMESPACE + "/identifier_select");
        return redirect(PROVIDER + "?" + encode(params));
    }

    @GetMapping("steam/callback")
    public ResponseEntity<Void> callback(HttpServletRequest request, @RequestParam Map<String, String> params) {
        HttpSession session = request.getSession(false);
        if (session == null) return failed();
        String expected = (String) session.getAttribute("openid.callback");
        Instant started = (Instant) session.getAttribute("openid.started");
        session.removeAttribute("openid.callback");
        session.removeAttribute("openid.started");
        try {
            String claimed = params.getOrDefault("openid.claimed_id", "");
            String nonce = params.getOrDefault("openid.response_nonce", "");
            Set<String> signed = new HashSet<>(Arrays.asList(params.getOrDefault("openid.signed", "").split(",")));
            boolean duplicates = request.getParameterMap().values().stream().anyMatch(values -> values.length != 1);
            if (duplicates || expected == null || started == null || started.isBefore(Instant.now().minusSeconds(600))
                || !expected.equals(publicUrl + "/api/v1/auth/steam/callback?state=" + params.get("state"))
                || !expected.equals(params.get("openid.return_to"))
                || !NAMESPACE.equals(params.get("openid.ns")) || !"id_res".equals(params.get("openid.mode"))
                || !PROVIDER.equals(params.get("openid.op_endpoint")) || !claimed.equals(params.get("openid.identity"))
                || !claimed.matches("https://steamcommunity\\.com/openid/id/7656119[0-9]{10}")
                || !signed.containsAll(Set.of("op_endpoint", "claimed_id", "identity", "return_to", "response_nonce", "assoc_handle"))
                || nonce.length() < 20 || Math.abs(Duration.between(Instant.parse(nonce.substring(0, 20)), Instant.now()).toSeconds()) > 600) return failed();
            var verification = new LinkedHashMap<String, String>();
            params.forEach((key, value) -> { if (key.startsWith("openid.")) verification.put(key, value); });
            verification.put("openid.mode", "check_authentication");
            var message = HttpRequest.newBuilder(URI.create(PROVIDER)).timeout(Duration.ofSeconds(12))
                .header("Content-Type", "application/x-www-form-urlencoded")
                .POST(HttpRequest.BodyPublishers.ofString(encode(verification))).build();
            var response = client.send(message, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200 || response.body().lines().noneMatch("is_valid:true"::equals)) return failed();
            request.changeSessionId();
            session.setAttribute("steamId", claimed.substring(claimed.lastIndexOf('/') + 1));
            session.setAttribute("csrf", token());
            return redirect(publicUrl + "/?login=success");
        } catch (Exception ex) { return failed(); }
    }

    @GetMapping("session")
    public ResponseEntity<?> session(HttpServletRequest request) {
        var session = request.getSession(false);
        Object id = session == null ? null : session.getAttribute("steamId");
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(id == null
            ? Map.of("authenticated", false)
            : Map.of("authenticated", true, "steamId", id, "csrfToken", session.getAttribute("csrf")));
    }

    @PostMapping("logout")
    public ResponseEntity<Void> logout(HttpServletRequest request, @RequestHeader(value="X-CSRF-Token", defaultValue="") String token) {
        var session = request.getSession(false);
        if (session == null || token.isBlank() || !token.equals(session.getAttribute("csrf"))) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        session.invalidate();
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }

    private ResponseEntity<Void> failed() { return redirect(publicUrl + "/?login=failed"); }
    private ResponseEntity<Void> redirect(String url) { return ResponseEntity.status(303).location(URI.create(url)).cacheControl(CacheControl.noStore()).build(); }
    private String token() { byte[] bytes = new byte[32]; random.nextBytes(bytes); return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes); }
    private static String encode(Map<String, String> params) {
        return params.entrySet().stream().map(e -> URLEncoder.encode(e.getKey(), StandardCharsets.UTF_8) + "=" + URLEncoder.encode(e.getValue(), StandardCharsets.UTF_8)).collect(Collectors.joining("&"));
    }
}
