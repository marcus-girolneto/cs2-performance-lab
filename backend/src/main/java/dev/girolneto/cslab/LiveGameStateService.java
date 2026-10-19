package dev.girolneto.cslab;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

@Service
public class LiveGameStateService {
    public record MatchPlayer(String steamId, String name, String team, Integer score,
                              Integer kills, Integer deaths, Integer assists) {}
    public record LiveState(boolean enabled, boolean connected, Instant updatedAt, String map, String phase, Integer round,
                            String playerName, String team, Integer teamScore, Integer opponentScore,
                            Integer health, Integer armor, Integer money, Integer kills, Integer deaths,
                            Integer assists, Integer roundKills, Integer roundDamage, List<MatchPlayer> players) {}

    private final AtomicReference<LiveState> latest = new AtomicReference<>();
    private final AtomicBoolean enabled = new AtomicBoolean();

    public void enable() {
        enabled.set(true);
    }

    public void disable() {
        enabled.set(false);
        latest.set(null);
    }

    public void accept(JsonNode payload) {
        if (!enabled.get()) return;
        if (payload == null || !payload.isObject()) throw new IllegalArgumentException("Expected a JSON object");
        JsonNode map = payload.path("map");
        JsonNode player = payload.path("player");
        JsonNode state = player.path("state");
        JsonNode stats = player.path("match_stats");
        String team = text(player, "team");
        var roster = new ArrayList<MatchPlayer>();
        JsonNode allPlayers = payload.path("allplayers");
        if (allPlayers.isObject()) {
            var fields = allPlayers.fields();
            while (fields.hasNext()) {
                Map.Entry<String, JsonNode> entry = fields.next();
                JsonNode row = entry.getValue();
                JsonNode rowStats = row.path("match_stats");
                String steamId = text(row, "steamid");
                if (steamId.isBlank() && entry.getKey().matches("7656119[0-9]{10}")) steamId = entry.getKey();
                roster.add(new MatchPlayer(steamId, text(row, "name"), text(row, "team"),
                    nullableInt(rowStats, "score"), nullableInt(rowStats, "kills"),
                    nullableInt(rowStats, "deaths"), nullableInt(rowStats, "assists")));
            }
        }
        if (roster.isEmpty()) roster.add(new MatchPlayer(text(player, "steamid"), text(player, "name"), team,
            nullableInt(stats, "score"), nullableInt(stats, "kills"), nullableInt(stats, "deaths"), nullableInt(stats, "assists")));
        boolean knownTeam = team.equalsIgnoreCase("CT") || team.equalsIgnoreCase("T");
        JsonNode ownTeam = map.path(team.equalsIgnoreCase("CT") ? "team_ct" : "team_t");
        JsonNode enemyTeam = map.path(team.equalsIgnoreCase("CT") ? "team_t" : "team_ct");
        if (!enabled.get()) return;
        latest.set(new LiveState(true, true, Instant.now(), text(map, "name"), text(map, "phase"), integer(map, "round"),
            text(player, "name"), team,
            knownTeam ? nullableInt(ownTeam, "score") : null, knownTeam ? nullableInt(enemyTeam, "score") : null,
            nullableInt(state, "health"), nullableInt(state, "armor"), nullableInt(state, "money"),
            nullableInt(stats, "kills"), nullableInt(stats, "deaths"), nullableInt(stats, "assists"),
            nullableInt(state, "round_kills"), nullableInt(state, "round_totaldmg"), List.copyOf(roster)));
    }

    public LiveState current() {
        LiveState value = latest.get();
        if (!enabled.get()) return empty(false);
        if (value == null) return empty(true);
        boolean connected = Duration.between(value.updatedAt(), Instant.now()).getSeconds() < 15;
        if (!connected) {
            latest.compareAndSet(value, null);
            return empty(true);
        }
        return new LiveState(true, connected, value.updatedAt(), value.map(), value.phase(), value.round(), value.playerName(),
            value.team(), value.teamScore(), value.opponentScore(), value.health(), value.armor(), value.money(),
            value.kills(), value.deaths(), value.assists(), value.roundKills(), value.roundDamage(), value.players());
    }

    private static LiveState empty(boolean enabled) {
        return new LiveState(enabled, false, null, "", "", null, "", "", null, null,
            null, null, null, null, null, null, null, null, List.of());
    }

    private static String text(JsonNode node, String field) {
        return node.path(field).asText("");
    }

    private static Integer integer(JsonNode node, String field) {
        return nullableInt(node, field);
    }

    private static Integer nullableInt(JsonNode node, String field) {
        JsonNode value = node.path(field);
        return value.isNumber() ? value.asInt() : null;
    }
}
