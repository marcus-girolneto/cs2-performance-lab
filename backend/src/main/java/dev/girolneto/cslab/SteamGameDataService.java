package dev.girolneto.cslab;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class SteamGameDataService {
    public record GameStat(String name, long value) {}
    public record GameData(boolean configured, boolean available, String reason, boolean ownsCs2,
                           Integer playtimeMinutes, Integer recentPlaytimeMinutes, List<GameStat> stats,
                           Instant fetchedAt) {}
    private record Cached(Instant expires, GameData value) {}

    private final String apiKey;
    private final ObjectMapper json;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    private final Map<String, Cached> cache = new ConcurrentHashMap<>();

    public SteamGameDataService(ObjectMapper json, @Value("${app.steam-api-key:}") String apiKey) {
        this.json = json;
        this.apiKey = apiKey.strip();
    }

    public GameData get(String steamId) {
        var cached = cache.get(steamId);
        if (cached != null && cached.expires().isAfter(Instant.now())) return cached.value();
        if (apiKey.isBlank()) return unavailable(false, "api_key_missing");
        try {
            String url = "https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key="
                + enc(apiKey) + "&steamid=" + enc(steamId) + "&include_appinfo=true&include_played_free_games=true";
            var response = request(url);
            var games = response.path("response").path("games");
            if (!games.isArray()) return unavailable(true, "game_details_private_or_unavailable");
            JsonNode cs2 = null;
            for (var game : games) if (game.path("appid").asInt() == 730) { cs2 = game; break; }
            if (cs2 == null) {
                var result = new GameData(true, true, "cs2_not_in_owned_games", false, null, null, List.of(), Instant.now());
                cache.put(steamId, new Cached(Instant.now().plusSeconds(600), result));
                return result;
            }
            Integer total = nullableInt(cs2, "playtime_forever");
            Integer recent = nullableInt(cs2, "playtime_2weeks");
            List<GameStat> stats = fetchStats(steamId);
            var result = new GameData(true, true, "", true, total, recent, stats, Instant.now());
            cache.put(steamId, new Cached(Instant.now().plusSeconds(600), result));
            return result;
        } catch (Exception ex) {
            return unavailable(true, "steam_api_unavailable");
        }
    }

    private List<GameStat> fetchStats(String steamId) {
        try {
            String url = "https://api.steampowered.com/ISteamUserStats/GetUserStatsForGame/v2/?key="
                + enc(apiKey) + "&steamid=" + enc(steamId) + "&appid=730";
            var rows = request(url).path("playerstats").path("stats");
            if (!rows.isArray()) return List.of();
            var result = new ArrayList<GameStat>();
            for (var stat : rows) {
                String name = stat.path("name").asText();
                if (!name.isBlank() && stat.path("value").canConvertToLong())
                    result.add(new GameStat(name, stat.path("value").asLong()));
            }
            return List.copyOf(result);
        } catch (Exception ex) {
            return List.of();
        }
    }

    private JsonNode request(String url) throws Exception {
        var request = HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(12))
            .header("Accept", "application/json").GET().build();
        var response = http.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 200) throw new IllegalStateException("Steam API unavailable");
        return json.readTree(response.body());
    }

    private static String enc(String value) { return URLEncoder.encode(value, StandardCharsets.UTF_8); }
    private static Integer nullableInt(JsonNode node, String key) {
        return node.hasNonNull(key) ? node.path(key).asInt() : null;
    }
    private static GameData unavailable(boolean configured, String reason) {
        return new GameData(configured, false, reason, false, null, null, List.of(), Instant.now());
    }
}
