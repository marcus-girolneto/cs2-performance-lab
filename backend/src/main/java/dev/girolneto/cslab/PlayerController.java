package dev.girolneto.cslab;

import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.time.Duration;
import java.util.Map;

@RestController
@RequestMapping("/api/v1")
public class PlayerController {
    private final PlayerService players;
    private final SteamGameDataService steamGameData;
    private final PlayerMatchSourcesService matchSources;
    public PlayerController(PlayerService players, SteamGameDataService steamGameData, PlayerMatchSourcesService matchSources) {
        this.players = players;
        this.steamGameData = steamGameData;
        this.matchSources = matchSources;
    }

    @GetMapping("/health")
    public Map<String, String> health() { return Map.of("status", "ok"); }

    @GetMapping("/players/lookup")
    public Object lookup(@RequestParam @NotBlank @Size(max=200) String query) {
        return players.lookup(query);
    }

    @GetMapping("/players/search")
    public Object search(@RequestParam @NotBlank @Size(min=2, max=64) String query,
                         @SessionAttribute(value="steamId", required=false) String requesterSteamId) {
        return players.search(query, requesterSteamId);
    }

    @GetMapping("/players/{steamId}")
    public ResponseEntity<?> profile(@PathVariable @Pattern(regexp="7656119[0-9]{10}") String steamId) {
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofMinutes(5)))
            .body(players.profile(steamId));
    }

    @GetMapping("/players/{steamId}/steam-data")
    public ResponseEntity<?> steamData(@PathVariable @Pattern(regexp="7656119[0-9]{10}") String steamId) {
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofMinutes(10)))
            .body(steamGameData.get(steamId));
    }

    @GetMapping("/players/{steamId}/match-data")
    public ResponseEntity<?> matchData(@PathVariable @Pattern(regexp="7656119[0-9]{10}") String steamId) {
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofMinutes(3)))
            .body(matchSources.get(steamId));
    }

    @GetMapping("/players/{steamId}/analytics")
    public Object analytics(@PathVariable @Pattern(regexp="7656119[0-9]{10}") String steamId) { return players.importedAnalytics(steamId); }

    @GetMapping("/players/{steamId}/matches")
    public ResponseEntity<?> matches(@PathVariable @Pattern(regexp="7656119[0-9]{10}") String steamId,
                                     @RequestParam(defaultValue="premier") @Pattern(regexp="premier|gamersclub|all|faceit") String source) {
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofMinutes(5)))
            .body(players.matches(steamId, source));
    }
}
