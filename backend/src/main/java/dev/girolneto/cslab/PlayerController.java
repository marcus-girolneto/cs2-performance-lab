package dev.girolneto.cslab;

import jakarta.validation.constraints.Pattern;
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

    @GetMapping("/players/{steamId}")
    public ResponseEntity<?> profile(@PathVariable @Pattern(regexp="7656119[0-9]{10}") String steamId) {
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofMinutes(5)))
            .body(players.profile(steamId));
    }

    @GetMapping("/players/{steamId}/matches")
    public ResponseEntity<?> matches(@PathVariable @Pattern(regexp="7656119[0-9]{10}") String steamId,
                                     @RequestParam(defaultValue="demo") @Pattern(regexp="demo|faceit") String source) {
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofMinutes(5)))
            .body(players.matches(steamId, source));
    }
}
