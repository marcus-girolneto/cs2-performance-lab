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
    public PlayerController(PlayerService players) { this.players = players; }

    @GetMapping("/health")
    public Map<String, String> health() { return Map.of("status", "ok"); }

    @GetMapping("/players/lookup")
    public Object lookup(@RequestParam @NotBlank @Size(max=200) String query) {
        return players.lookup(query);
    }

    @GetMapping("/players/{steamId}")
    public ResponseEntity<?> profile(@PathVariable @Pattern(regexp="7656119[0-9]{10}") String steamId) {
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofMinutes(5)))
            .body(players.profile(steamId));
    }

    @GetMapping("/players/{steamId}/matches")
    public ResponseEntity<?> matches(@PathVariable @Pattern(regexp="7656119[0-9]{10}") String steamId,
                                     @RequestParam(defaultValue="faceit") @Pattern(regexp="faceit") String source) {
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofMinutes(5)))
            .body(players.matches(steamId, source));
    }
}
