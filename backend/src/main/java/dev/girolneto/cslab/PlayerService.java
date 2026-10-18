package dev.girolneto.cslab;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import org.w3c.dom.Document;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import java.io.ByteArrayInputStream;
import java.net.URI;
import java.net.http.*;
import java.time.*;
import java.util.*;

@Service
public class PlayerService {
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    private final ObjectMapper json;
    private final String faceitKey;
    private final Map<String, Cached> cache = Collections.synchronizedMap(new LinkedHashMap<>() {
        protected boolean removeEldestEntry(Map.Entry<String, Cached> entry) { return size() > 200; }
    });
    private record Cached(Instant expires, Object value) {}
    public record Profile(String steamId, String name, String avatar, String url, String visibility, String memberSince, String source, Instant fetchedAt) {}
    public record Match(String id, String map, Instant playedAt, boolean won, int ownScore, int enemyScore,
                        int kills, int deaths, int assists, Double adr, Double headshot, String url) {}
    public record Matches(String source, Instant fetchedAt, List<Match> matches) {}

    public PlayerService(ObjectMapper json, @Value("${app.faceit-key}") String faceitKey) {
        this.json = json; this.faceitKey = faceitKey;
    }

    public Profile profile(String id) { return fetchProfile("profiles/" + id); }

    public Profile lookup(String query) {
        String value = query.strip();
        if (value.matches("7656119[0-9]{10}")) return profile(value);
        var match = java.util.regex.Pattern.compile("^(?:https://)?steamcommunity\\.com/(profiles/7656119[0-9]{10}|id/[a-zA-Z0-9_-]{1,64})/?$").matcher(value);
        if (!match.matches()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Use a SteamID64 or Steam profile URL");
        return fetchProfile(match.group(1));
    }

    private Profile fetchProfile(String path) {
        var cached = cache.get(path);
        if (cached != null && cached.expires().isAfter(Instant.now())) return (Profile) cached.value();
        try {
            var factory = DocumentBuilderFactory.newInstance();
            factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
            factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
            var doc = factory.newDocumentBuilder().parse(new ByteArrayInputStream(get("https://steamcommunity.com/" + path + "/?xml=1", false)));
            String id = text(doc, "steamID64");
            if (!id.matches("7656119[0-9]{10}")) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Steam profile not found");
            var result = new Profile(id, text(doc, "steamID"), text(doc, "avatarFull"),
                "https://steamcommunity.com/profiles/" + id + "/", text(doc, "privacyState"), text(doc, "memberSince"), "steam", Instant.now());
            cache.put(path, new Cached(Instant.now().plusSeconds(300), result));
            return result;
        } catch (ResponseStatusException ex) { throw ex;
        } catch (Exception ex) { throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Steam profile unavailable"); }
    }

    public Object matches(String id, String source) {
        if (faceitKey.isBlank()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "FACEIT_API_KEY is not configured");
        String key = "faceit:" + id;
        var cached = cache.get(key);
        if (cached != null && cached.expires().isAfter(Instant.now())) return cached.value();
        try {
            var player = faceit("/players?game=cs2&game_player_id=" + id);
            String playerId = player.path("player_id").asText();
            var history = faceit("/players/" + playerId + "/history?game=cs2&offset=0&limit=20");
            var matches = new ArrayList<Match>();
            for (var match : history.path("items")) {
                var stats = faceit("/matches/" + match.path("match_id").asText() + "/stats");
                for (var round : stats.path("rounds")) for (var team : round.path("teams")) for (var p : team.path("players")) {
                    if (!p.path("player_id").asText().equals(playerId)) continue;
                    var s = p.path("player_stats");
                    String teamId = team.path("team_id").asText();
                    int own = team.path("team_stats").path("Final Score").asInt();
                    int enemy = 0;
                    for (var other : round.path("teams")) if (!other.path("team_id").asText().equals(teamId)) enemy = other.path("team_stats").path("Final Score").asInt();
                    matches.add(new Match(match.path("match_id").asText(), round.path("round_stats").path("Map").asText("unknown").replace("de_", ""),
                        Instant.ofEpochSecond(match.path("finished_at").asLong()), team.path("team_stats").path("Team Win").asInt() == 1,
                        own, enemy, s.path("Kills").asInt(), s.path("Deaths").asInt(), s.path("Assists").asInt(),
                        number(s, "ADR"), number(s, "Headshots %"), "https://www.faceit.com/en/cs2/room/" + match.path("match_id").asText()));
                }
            }
            var result = new Matches("faceit", Instant.now(), matches);
            cache.put(key, new Cached(Instant.now().plusSeconds(300), result));
            return result;
        } catch (Exception ex) { throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "FACEIT data unavailable"); }
    }

    private JsonNode faceit(String path) throws Exception { return json.readTree(get("https://open.faceit.com/data/v4" + path, true)); }
    private byte[] get(String url, boolean authenticated) throws Exception {
        var request = HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(12)).header("Accept", authenticated ? "application/json" : "application/xml");
        if (authenticated) request.header("Authorization", "Bearer " + faceitKey);
        var response = http.send(request.GET().build(), HttpResponse.BodyHandlers.ofByteArray());
        if (response.statusCode() != 200) throw new IllegalStateException("Upstream request failed");
        return response.body();
    }
    private static String text(Document doc, String tag) { var n = doc.getElementsByTagName(tag); return n.getLength() == 0 ? "" : n.item(0).getTextContent(); }
    private static Double number(JsonNode node, String key) {
        if (!node.hasNonNull(key)) return null;
        try { return Double.valueOf(node.get(key).asText()); } catch (NumberFormatException ex) { return null; }
    }
}
