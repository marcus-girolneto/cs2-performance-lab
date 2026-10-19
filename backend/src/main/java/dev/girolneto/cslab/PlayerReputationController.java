package dev.girolneto.cslab;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import jakarta.validation.constraints.Pattern;

@RestController
@RequestMapping("/api/v1/players/{steamId}/reputation")
public class PlayerReputationController {
    public record ReportBody(@NotBlank @Pattern(regexp="aimbot|wallhack|other") String category,
                             @NotBlank @Size(max=500) String evidenceUrl) {}
    public record Reputation(SteamBanService.BanRecord steamBans, CommunityReputationService.Summary community,
                             Integer publicSignalScore, String scoreMeaning,
                             int vacBanDeduction, int gameBanDeduction, int reportDeduction) {}

    private final SteamBanService steamBans;
    private final CommunityReputationService community;

    public PlayerReputationController(SteamBanService steamBans, CommunityReputationService community) {
        this.steamBans = steamBans;
        this.community = community;
    }

    @GetMapping
    public Reputation get(@PathVariable @Pattern(regexp="7656119[0-9]{10}") String steamId) {
        var bans = steamBans.get(steamId);
        var reports = community.summary(steamId);
        int vacDeduction = Math.min(50, bans.vacBanCount() * 20);
        int gameDeduction = Math.min(30, bans.gameBanCount() * 10);
        int reportDeduction = Math.min(20, reports.unverifiedReports() * 2);
        Integer score = bans.available()
            ? Math.max(0, 100 - vacDeduction - gameDeduction - reportDeduction)
            : null;
        return new Reputation(bans, reports, score,
            "Signal index only; not a cheating probability or a verdict. VAC/Game bans are account-wide, not necessarily CS2-specific. Community reports are unverified.",
            bans.available() ? vacDeduction : 0, bans.available() ? gameDeduction : 0, reportDeduction);
    }

    @PostMapping("/reports")
    public CommunityReputationService.Summary report(@PathVariable @Pattern(regexp="7656119[0-9]{10}") String steamId,
            @Valid @RequestBody ReportBody body, HttpServletRequest request,
            @RequestHeader(value="X-CSRF-Token", defaultValue="") String csrf) {
        HttpSession session = request.getSession(false);
        if (session == null || session.getAttribute("steamId") == null || csrf.isBlank() || !csrf.equals(session.getAttribute("csrf"))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Sign in with Steam to submit a report");
        }
        String reporterId = (String) session.getAttribute("steamId");
        return community.submit(steamId, reporterId, new CommunityReputationService.ReportRequest(body.category(), body.evidenceUrl()));
    }
}
