package dev.girolneto.cslab;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class SteamBanService {
    public record BanRecord(boolean available, boolean configured, boolean communityBanned, boolean vacBanned, int vacBanCount,
                            int gameBanCount, int daysSinceLastBan, String economyBan, Instant fetchedAt) {}
    private record Cached(Instant expires, BanRecord value) {}

    private final String apiKey;
    private final ObjectMapper json;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    private final Map<String, Cached> cache = new ConcurrentHashMap<>();

    public SteamBanService(ObjectMapper json, @Value("${app.steam-api-key:}") String apiKey) {
        this.json = json;
        this.apiKey = apiKey.strip();
    }

    public BanRecord get(String steamId) {
        var cached = cache.get(steamId);
        if (cached != null && cached.expires().isAfter(Instant.now())) return cached.value();
        if (apiKey.isBlank()) return unavailable();
        try {
            String url = "https://api.steampowered.com/ISteamUser/GetPlayerBans/v1/?key="
                + URLEncoder.encode(apiKey, StandardCharsets.UTF_8) + "&steamids=" + steamId;
            var request = HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(12))
                .header("Accept", "application/json").GET().build();
            var response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) throw new IllegalStateException("Steam API unavailable");
            JsonNode player = json.readTree(response.body()).path("players").path(0);
            if (!steamId.equals(player.path("SteamId").asText())) throw new IllegalStateException("Steam returned no ban record");
            var record = new BanRecord(true, true, player.path("CommunityBanned").asBoolean(), player.path("VACBanned").asBoolean(),
                player.path("NumberOfVACBans").asInt(), player.path("NumberOfGameBans").asInt(),
                player.path("DaysSinceLastBan").asInt(), player.path("EconomyBan").asText("none"), Instant.now());
            cache.put(steamId, new Cached(Instant.now().plusSeconds(900), record));
            return record;
        } catch (Exception ex) {
            return new BanRecord(false, true, false, false, 0, 0, 0, "unknown", Instant.now());
        }
    }

    private BanRecord unavailable() {
        return new BanRecord(false, false, false, false, 0, 0, 0, "unknown", Instant.now());
    }
}
