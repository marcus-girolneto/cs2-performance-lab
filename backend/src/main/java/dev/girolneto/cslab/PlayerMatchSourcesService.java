package dev.girolneto.cslab;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

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
public class PlayerMatchSourcesService {
    public record Match(String id, String map, Instant playedAt, String displayedDate, String mode,
                        Boolean won, int ownScore, int enemyScore, int kills, int deaths, int assists,
                        Double adr, Double headshot, Double rating, Integer firstKills, Integer firstDeaths,
                        Double timeToDamage, Double preaim, String url) {}
    public record ProviderStatus(String source, boolean configured, boolean available, int matchCount, String message) {}
    public record PlayerMatchData(String source, Instant fetchedAt, List<Match> matches,
                                  List<ProviderStatus> providers, JsonNode leetifyProfile, JsonNode csrepProfile) {}
    private record Cached(Instant expires, PlayerMatchData value) {}

    private final ObjectMapper json;
    private final String leetifyKey;
    private final String csrepKey;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    private final Map<String, Cached> cache = new ConcurrentHashMap<>();

    public PlayerMatchSourcesService(ObjectMapper json,
                                     @Value("${app.leetify-api-key:}") String leetifyKey,
                                     @Value("${app.csrep-api-key:}") String csrepKey) {
        this.json = json;
        this.leetifyKey = leetifyKey.strip();
        this.csrepKey = csrepKey.strip();
    }

    public PlayerMatchData get(String steamId) {
        if (!steamId.matches("7656119[0-9]{10}")) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid SteamID64");
        var cached = cache.get(steamId);
        if (cached != null && cached.expires().isAfter(Instant.now())) return cached.value();

        var providers = new ArrayList<ProviderStatus>();
        JsonNode profile = null;
        JsonNode csrep = null;
        var matches = new LinkedHashMap<String, Match>();

        try {
            profile = leetify("/v3/profile?steamId=" + enc(steamId));
            JsonNode history = leetify("/v3/profile/matches?steamId=" + enc(steamId) + "&limit=100&offset=0");
            for (var row : rows(history, "matches")) {
                Match match = leetifyMatch(row, steamId);
                if (match != null) matches.putIfAbsent(match.id(), match);
            }
            if (matches.isEmpty()) for (var row : rows(profile, "recent_matches")) {
                Match match = leetifyMatch(row, steamId);
                if (match != null) matches.putIfAbsent(match.id(), match);
            }
            providers.add(new ProviderStatus("leetify", true, true, matches.size(), ""));
        } catch (Exception ex) {
            providers.add(new ProviderStatus("leetify", true, false, 0, "profile_unavailable_or_private"));
        }

        int leetifyMatchCount = matches.size();
        if (csrepKey.isBlank()) {
            providers.add(new ProviderStatus("csrep", false, false, 0, "api_key_missing"));
        } else {
            try {
                csrep = request("https://csrep.gg/api/players/" + steamId, "X-API-Key", csrepKey);
                int csrepCount = appendCsrepMatches(csrep, steamId, matches);
                providers.add(new ProviderStatus("csrep", true, true, csrepCount, ""));
            } catch (Exception ex) {
                providers.add(new ProviderStatus("csrep", true, false, 0, "profile_unavailable"));
            }
        }

        var result = new PlayerMatchData("leetify+csrep", Instant.now(), List.copyOf(matches.values()),
            List.copyOf(providers), profile, csrep);
        cache.put(steamId, new Cached(Instant.now().plusSeconds(180), result));
        return result;
    }

    private JsonNode leetify(String path) throws Exception {
        var request = HttpRequest.newBuilder(URI.create("https://api-public.cs-prod.leetify.com" + path))
            .timeout(Duration.ofSeconds(10)).header("Accept", "application/json");
        if (!leetifyKey.isBlank()) request.header("Authorization", "Bearer " + leetifyKey);
        return send(request.GET().build());
    }

    private JsonNode request(String url, String header, String token) throws Exception {
        var request = HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(10))
            .header("Accept", "application/json").header(header, token).GET().build();
        return send(request);
    }

    private JsonNode send(HttpRequest request) throws Exception {
        var response = http.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() < 200 || response.statusCode() >= 300)
            throw new IllegalStateException("Provider returned HTTP " + response.statusCode());
        return json.readTree(response.body());
    }

    private int appendCsrepMatches(JsonNode response, String steamId, Map<String, Match> matches) {
        int count = 0;
        for (String key : List.of("matches", "recent_matches", "recentMatches", "match_history")) {
            for (var row : rows(response, key)) {
                Match match = leetifyMatch(row, steamId);
                if (match != null) {
                    matches.putIfAbsent(match.id(), match);
                    count++;
                }
            }
        }
        return count;
    }

    private static List<JsonNode> rows(JsonNode node, String key) {
        JsonNode array = node.isArray() ? node : node.path(key);
        if (array.isObject()) array = array.path("items");
        if (!array.isArray()) return List.of();
        var rows = new ArrayList<JsonNode>();
        array.forEach(rows::add);
        return rows;
    }

    private Match leetifyMatch(JsonNode row, String steamId) {
        JsonNode player = null;
        for (var stats : rows(row, "stats")) {
            String id = firstText(stats, "steam64_id", "steam_id", "steamId", "steamid");
            if (steamId.equals(id)) { player = stats; break; }
        }
        if (player == null && row.has("total_kills")) player = row;

        String sourceId = firstText(row, "data_source_match_id", "match_id", "matchId", "id");
        String id = firstText(row, "id", "game_id", "match_id", "data_source_match_id");
        if (id.isBlank()) id = sourceId;
        if (id.isBlank()) return null;

        String source = firstText(row, "data_source", "source", "mode").toLowerCase(Locale.ROOT);
        String mode = source.contains("faceit") ? "FACEIT"
            : source.contains("competitive") ? "Competitive"
            : source.contains("wingman") ? "Wingman"
            : source.contains("matchmaking") ? "Premier"
            : firstText(row, "game_mode", "mode", "queue_type");

        int ownScore = 0, enemyScore = 0;
        Integer team = player == null ? nullableInt(row, "team_number") : nullableInt(player, "team_number");
        JsonNode scoreRows = row.path("team_scores");
        if (scoreRows.isArray()) for (var score : scoreRows) {
            Integer number = nullableInt(score, "team_number");
            int value = (int) firstNumber(score, "score", "team_score", "total_score");
            if (team != null && number != null && team.equals(number)) ownScore = value;
            else enemyScore = value;
        }
        Boolean won = ownScore == enemyScore ? null : ownScore > enemyScore;
        String map = firstText(row, "map_name", "map", "mapName").replaceFirst("^de_", "");
        String finished = firstText(row, "finished_at", "played_at", "playedAt", "date");
        Instant playedAt = null;
        try { if (!finished.isBlank()) playedAt = Instant.parse(finished); } catch (Exception ignored) {}
        String url = firstText(row, "url", "match_url");
        if (url.isBlank() && !id.isBlank()) url = "https://leetify.com/app/match/" + id;

        JsonNode stats = player == null ? row : player;
        return new Match(id, map.isBlank() ? "unknown" : map, playedAt, finished, mode, won, ownScore, enemyScore,
            (int) firstNumber(stats, "total_kills", "kills"), (int) firstNumber(stats, "total_deaths", "deaths"),
            (int) firstNumber(stats, "total_assists", "assists"), nullableDouble(stats, "total_damage_avg_per_round", "adr"),
            nullableDouble(stats, "total_headshot_percentage", "headshot_percentage", "headshot"),
            nullableDouble(stats, "leetify_rating", "hltv_rating", "rating"),
            nullableInt(stats, "total_first_kills", "first_kills"), nullableInt(stats, "total_first_deaths", "first_deaths"),
            nullableDouble(stats, "time_to_damage", "timeToDamage"), nullableDouble(stats, "preaim"), url);
    }

    private static String firstText(JsonNode node, String... keys) {
        for (String key : keys) if (node.hasNonNull(key)) {
            String value = node.path(key).asText("");
            if (!value.isBlank()) return value;
        }
        return "";
    }
    private static double firstNumber(JsonNode node, String... keys) {
        for (String key : keys) if (node.hasNonNull(key)) {
            JsonNode value = node.path(key);
            if (value.isNumber()) return value.asDouble();
            try { return Double.parseDouble(value.asText()); } catch (Exception ignored) {}
        }
        return 0;
    }
    private static Integer nullableInt(JsonNode node, String... keys) {
        for (String key : keys) if (node.hasNonNull(key)) return (int) firstNumber(node, key);
        return null;
    }
    private static Double nullableDouble(JsonNode node, String... keys) {
        for (String key : keys) if (node.hasNonNull(key)) return firstNumber(node, key);
        return null;
    }
    private static String enc(String value) { return URLEncoder.encode(value, StandardCharsets.UTF_8); }
}
