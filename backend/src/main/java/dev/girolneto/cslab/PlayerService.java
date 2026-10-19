package dev.girolneto.cslab;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import java.nio.file.Files;
import java.nio.file.Path;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import org.jsoup.Jsoup;
import org.w3c.dom.Document;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import java.io.ByteArrayInputStream;
import java.net.URI;
import java.net.http.*;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;

@Service
public class PlayerService {
    private static final System.Logger logger = System.getLogger(PlayerService.class.getName());
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    private final ObjectMapper json;
    private final String faceitKey;
    private final String steamApiKey;
    private final Path importDirectory;
    private final Map<String, Cached> cache = Collections.synchronizedMap(new LinkedHashMap<>() {
        protected boolean removeEldestEntry(Map.Entry<String, Cached> entry) { return size() > 200; }
    });
    private record Cached(Instant expires, Object value) {}
    public record Profile(String steamId, String name, String avatar, String url, String visibility, String memberSince, String source, Instant fetchedAt) {}
    public record SearchHit(String name, String avatar, String profileUrl, String source) {}
    public record Match(String id, String map, Instant playedAt, boolean won, int ownScore, int enemyScore,
                        int kills, int deaths, int assists, Double adr, Double headshot, String url) {}
    public record Matches(String source, Instant fetchedAt, List<Match> matches, boolean available, String reason) {}

    public PlayerService(ObjectMapper json, @Value("${app.faceit-key}") String faceitKey,
                         @Value("${app.steam-api-key:}") String steamApiKey,
                         @Value("${app.import-directory}") String importDirectory) {
        this.json = json; this.faceitKey = faceitKey; this.steamApiKey = steamApiKey.strip();
        this.importDirectory = Path.of(importDirectory).toAbsolutePath().normalize();
    }

    public Profile profile(String id) { return fetchProfile("profiles/" + id); }

    public Profile lookup(String query) {
        String value = query.strip();
        if (value.matches("7656119[0-9]{10}")) return profile(value);
        var leetify = java.util.regex.Pattern.compile("^(?:https?://)?(?:www\\.)?leetify\\.com/app/profile/(7656119[0-9]{10})/?(?:[?#].*)?$", java.util.regex.Pattern.CASE_INSENSITIVE).matcher(value);
        if (leetify.matches()) return profile(leetify.group(1));
        var faceit = java.util.regex.Pattern.compile("^(?:https?://)?(?:www\\.)?faceit\\.com/(?:[a-z]{2}/)?players/([a-zA-Z0-9_-]{1,64})/?(?:[?#].*)?$", java.util.regex.Pattern.CASE_INSENSITIVE).matcher(value);
        if (faceit.matches()) {
            if (faceitKey.isBlank()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "FACEIT_API_KEY is not configured");
            try {
                var player = faceit("/players?nickname=" + URLEncoder.encode(faceit.group(1), StandardCharsets.UTF_8));
                String steamId = player.path("games").path("cs2").path("game_player_id").asText();
                if (!steamId.matches("7656119[0-9]{10}")) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "FACEIT player is not linked to a Steam profile");
                return profile(steamId);
            } catch (ResponseStatusException ex) { throw ex;
            } catch (Exception ex) { throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "FACEIT player lookup unavailable"); }
        }
        var steam = java.util.regex.Pattern.compile("^(?:https?://)?(?:www\\.)?steamcommunity\\.com/(profiles/7656119[0-9]{10}|id/[a-zA-Z0-9_-]{1,64})/?(?:[?#].*)?$", java.util.regex.Pattern.CASE_INSENSITIVE).matcher(value);
        if (!steam.matches()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Use a SteamID64, Steam/CSRep profile, Leetify profile, or FACEIT profile URL");
        return fetchProfile(steam.group(1));
    }

    public List<SearchHit> search(String query) { return search(query, null); }

    public List<SearchHit> search(String query, String requesterSteamId) {
        String term = query.strip();
        if (term.length() < 2 || term.length() > 64) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Search must be between 2 and 64 characters");
        String cacheKey = "search:" + term.toLowerCase(Locale.ROOT);
        var cached = cache.get(cacheKey);
        if (cached != null && cached.expires().isAfter(Instant.now())) {
            @SuppressWarnings("unchecked") var hits = (List<SearchHit>) cached.value();
            return hits;
        }
        try {
            String url = "https://steamcommunity.com/actions/SearchAjax?term=" + URLEncoder.encode(term, StandardCharsets.UTF_8)
                + "&page=1&filter=users&cc=us&l=english";
            List<SearchHit> results = List.of();
            try {
                var body = json.readTree(steamResponse(url, "application/json"));
                String html = body.path("searchresults_html").asText("");
                results = parseSearchResults(html);
                logger.log(System.Logger.Level.INFO, "Steam SearchAjax returned {0} chars; parsed {1} profiles", html.length(), results.size());
            } catch (Exception ex) {
                logger.log(System.Logger.Level.WARNING, "Steam SearchAjax failed: {0}", ex.getClass().getSimpleName());
            }
            if (results.isEmpty()) {
                String fallback = "https://steamcommunity.com/search/users/?text=" + URLEncoder.encode(term, StandardCharsets.UTF_8);
                String html = steamResponse(fallback, "text/html");
                results = parseSearchResults(html);
                var document = Jsoup.parse(html);
                logger.log(System.Logger.Level.INFO,
                    "Steam HTML search returned {0} chars; title={1}; links={2}; profileLinks={3}; vanityLinks={4}; resultRows={5}; personaNames={6}; steamIds={7}; parsed={8}",
                    html.length(), document.title(), document.select("a[href]").size(),
                    document.select("a[href*='/profiles/']").size(), document.select("a[href*='/id/']").size(),
                    document.select(".search_row, .search_result_row").size(), document.select(".searchPersonaName").size(),
                    document.select("[data-steamid]").size(), results.size());
            }
            if (results.isEmpty() && requesterSteamId != null && requesterSteamId.matches("7656119[0-9]{10}")) {
                results = searchFriends(term, requesterSteamId);
            }
            var result = List.copyOf(results);
            if (!result.isEmpty()) cache.put(cacheKey, new Cached(Instant.now().plusSeconds(20), result));
            return result;
        } catch (ResponseStatusException ex) { throw ex;
        } catch (Exception ex) { throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Steam player search unavailable"); }
    }

    private String steamResponse(String url, String accept) throws Exception {
        var request = HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(12))
            .header("Accept", accept)
            .header("User-Agent", "Mozilla/5.0 (compatible; CS2PerformanceLab/0.1)")
            .GET().build();
        var response = http.send(request, HttpResponse.BodyHandlers.ofString());
        logger.log(System.Logger.Level.INFO, "Steam endpoint {0} returned HTTP {1} with {2} chars", URI.create(url).getPath(), response.statusCode(), response.body().length());
        if (response.statusCode() != 200) throw new IllegalStateException("Steam search unavailable");
        return response.body();
    }

    private List<SearchHit> parseSearchResults(String html) {
        var document = Jsoup.parse(html);
        if (document.select("a[href*='/profiles/'], a[href*='/id/']").isEmpty()) {
            document = Jsoup.parse(org.jsoup.parser.Parser.unescapeEntities(html, true));
        }
        var results = new ArrayList<SearchHit>();
        for (var link : document.select("a[href*='/profiles/'], a[href*='/id/']")) {
            try {
                String href = link.attr("href");
                URI candidate = URI.create(href.startsWith("//") ? "https:" + href
                    : href.startsWith("/") ? "https://steamcommunity.com" + href : href);
                if (!"steamcommunity.com".equalsIgnoreCase(candidate.getHost())) continue;
                String path = candidate.getPath();
                if (path == null || !path.matches("/(?:profiles/7656119[0-9]{10}|id/[A-Za-z0-9_-]{1,64})/?")) continue;
                var row = link.closest(".search_result_row, .search_row, li, .match");
                var content = row == null ? link : row;
                var nameElement = content.select(".searchPersonaName, .persona_name, .searchResultName").first();
                String name = nameElement == null ? link.text() : nameElement.text();
                if (name.isBlank()) name = content.text();
                String avatar = content.select("img").attr("src");
                String profileUrl = "https://steamcommunity.com" + path.replaceAll("/$", "") + "/";
                if (!name.isBlank() && results.stream().noneMatch(result -> result.profileUrl().equals(profileUrl))) {
                    results.add(new SearchHit(name, avatar, profileUrl, "community"));
                }
                if (results.size() == 10) break;
            } catch (IllegalArgumentException ignored) { }
        }
        for (var row : document.select("[data-steamid]")) {
            String id = row.attr("data-steamid");
            if (!id.matches("7656119[0-9]{10}")) continue;
            String name = row.select(".searchPersonaName, .persona_name, .searchResultName").text();
            if (name.isBlank()) name = row.text();
            String profileUrl = "https://steamcommunity.com/profiles/" + id + "/";
            if (!name.isBlank() && results.stream().noneMatch(result -> result.profileUrl().equals(profileUrl))) {
                results.add(new SearchHit(name, row.select("img").attr("src"), profileUrl, "community"));
            }
            if (results.size() == 10) break;
        }
        return results;
    }

    private List<SearchHit> searchFriends(String query, String requesterSteamId) {
        if (steamApiKey.isBlank()) return List.of();
        String cacheKey = "friend-list:" + requesterSteamId;
        var cached = cache.get(cacheKey);
        List<SearchHit> friends;
        if (cached != null && cached.expires().isAfter(Instant.now())) {
            @SuppressWarnings("unchecked") var cachedFriends = (List<SearchHit>) cached.value();
            friends = cachedFriends;
        } else {
            try {
                String friendsUrl = "https://api.steampowered.com/ISteamUser/GetFriendList/v1/?key="
                    + URLEncoder.encode(steamApiKey, StandardCharsets.UTF_8) + "&steamid=" + requesterSteamId + "&relationship=friend";
                var response = steamApi(friendsUrl).path("friendslist").path("friends");
                var ids = new ArrayList<String>();
                for (var friend : response) {
                    String id = friend.path("steamid").asText();
                    if (id.matches("7656119[0-9]{10}")) ids.add(id);
                    if (ids.size() == 500) break;
                }
                var summaries = new ArrayList<SearchHit>();
                for (int start = 0; start < ids.size(); start += 100) {
                    String batch = String.join(",", ids.subList(start, Math.min(start + 100, ids.size())));
                    String summariesUrl = "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key="
                        + URLEncoder.encode(steamApiKey, StandardCharsets.UTF_8) + "&steamids="
                        + URLEncoder.encode(batch, StandardCharsets.UTF_8);
                    for (var player : steamApi(summariesUrl).path("response").path("players")) {
                        String id = player.path("steamid").asText();
                        if (!id.matches("7656119[0-9]{10}")) continue;
                        summaries.add(new SearchHit(player.path("personaname").asText(), player.path("avatarfull").asText(),
                            player.path("profileurl").asText("https://steamcommunity.com/profiles/" + id + "/"), "friends"));
                    }
                }
                friends = List.copyOf(summaries);
                cache.put(cacheKey, new Cached(Instant.now().plusSeconds(60), friends));
            } catch (Exception ex) {
                logger.log(System.Logger.Level.WARNING, "Steam friend search failed: {0}", ex.getClass().getSimpleName());
                return List.of();
            }
        }
        String normalized = query.toLowerCase(Locale.ROOT);
        return friends.stream().filter(friend -> friend.name().toLowerCase(Locale.ROOT).contains(normalized)).limit(10).toList();
    }

    private JsonNode steamApi(String url) throws Exception {
        var request = HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(8))
            .header("Accept", "application/json").GET().build();
        var response = http.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 200) throw new IllegalStateException("Steam API returned HTTP " + response.statusCode());
        return json.readTree(response.body());
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

    public JsonNode importedAnalytics(String id) {
        var resource = importDirectory.resolve(id + ".json").normalize();
        if (!resource.getParent().equals(importDirectory) || !Files.isRegularFile(resource)) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No imported match history for this player");
        try (var stream = Files.newInputStream(resource)) { return json.readTree(stream); }
        catch (java.io.IOException ex) { throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Import unavailable"); }
    }

    public Object matches(String id, String source) {
        if (!source.equals("faceit")) {
            JsonNode imported;
            try { imported = importedAnalytics(id); }
            catch (ResponseStatusException ex) {
                if (ex.getStatusCode() != HttpStatus.NOT_FOUND) throw ex;
                return new Matches("unavailable", Instant.now(), List.of(), false, "no_match_history_source");
            }
            var result = imported.deepCopy();
            var matches = json.createArrayNode();
            for (var match : imported.path("matches")) {
                if (source.equals("all") || (source.equals("premier") && match.path("mode").asText().equals("Premier"))
                    || (source.equals("gamersclub") && match.path("mode").asText().equals("GamersClub"))) matches.add(match);
            }
            ((com.fasterxml.jackson.databind.node.ObjectNode) result).set("matches", matches);
            return result;
        }
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

            var result = new Matches("faceit", Instant.now(), matches, true, "");
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
