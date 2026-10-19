package dev.girolneto.cslab;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/live")
public class LiveGameStateController {
    private final LiveGameStateService live;

    public LiveGameStateController(LiveGameStateService live) {
        this.live = live;
    }

    @PostMapping("/gsi")
    public void receive(@RequestBody JsonNode payload) {
        try {
            live.accept(payload);
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid CS2 game state payload");
        }
    }

    @PostMapping("/enable")
    public LiveGameStateService.LiveState enable() {
        live.enable();
        return live.current();
    }

    @PostMapping("/disable")
    public LiveGameStateService.LiveState disable() {
        live.disable();
        return live.current();
    }

    @GetMapping
    public LiveGameStateService.LiveState current() {
        return live.current();
    }
}
