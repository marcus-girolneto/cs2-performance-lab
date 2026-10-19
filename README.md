# CS2 Performance Lab

A personal Counter-Strike 2 analytics workspace built with Java 21, Spring Boot, React and TypeScript. Public Steam identity, source-aware match analytics, interactive charts and a focused training checklist. Available in English and Brazilian Portuguese.

**Real data only:** no fabricated matches, sample statistics or saved identity fallback. Public profiles and name search come from Steam; match history is shown only when an authorized source has it. Searching opens a separate player viewer and never changes the connected account dashboard.

## Run locally

Requires Docker with Compose.

```sh
docker compose up --build -d
```

Open **http://localhost:5173**. Stop with `docker compose down`. The application binds to the loopback interface only. Containers restart automatically while Docker is running.

### Connect FACEIT

1. Create a server-side key in the [FACEIT developer portal](https://developers.faceit.com/).
2. Copy `.env.example` to `.env`, and set `FACEIT_API_KEY`.
3. Run `docker compose up -d --force-recreate backend`.
4. Refresh the dashboard. FACEIT is the match source.

The Steam account must be linked to FACEIT CS2. The adapter loads up to 20 recent matches and their player statistics. Private/unavailable data and missing credentials produce an explicit error; no sample data is substituted. No API key is shipped to the browser. This integration has not been exercised against an authenticated account in this initial release.

### Official ban records and community reports

Set `STEAM_API_KEY` in `.env` to enable live ban records from Steam's `GetPlayerBans` API. Without a key, the UI marks this source unavailable; it does not treat missing data as a clean record. Steam ban records do not establish whether a player cheated in a particular match.

Signed-in users can submit one evidence-linked community report per player. The profile computes a **public signal index** only when Steam's ban API responds: `100 - min(VAC bans × 20, 50) - min(Game bans × 10, 30) - min(unverified reports × 2, 20)`, bounded to 0–100. This is not a cheating probability or verdict. Steam ban counts are account-wide and may relate to other games; reports are unverified and capped at a small influence. A missing Steam response leaves the index unavailable rather than implying a clean record. Evidence links are retained privately in the Docker volume `community-data`; do not expose this local app publicly without adding moderation, abuse controls and a privacy policy. This volume is separate from the read-only profile import.

### Local live match state

Live Match is optional and starts disabled. The user downloads the GSI config, copies it into the game's `game/csgo/cfg/` directory, restarts CS2, then explicitly enables reception in the app. The config requests map/round state, local player state, and all-player IDs and match stats; it does not request positions. The local backend keeps the latest payload in memory only, clears it when disabled, and expires it after 15 seconds without updates. Data availability depends on the fields CS2 sends in that session. The current build is for the local app bound to `127.0.0.1`; a hosted multi-user platform would need an authenticated local companion to relay opted-in sessions.

### Development

Requires Java 21+, Maven 3.9+, Node 22.12+.

```sh
cd backend
mvn spring-boot:run
```

In a separate terminal:

```sh
cd frontend
npm ci
npm run dev
```

Vite proxies `/api` to port 8080. Stop the Compose stack first to free port 5173.

## Features

- Live public Steam identity with explicit loading/unavailable states.
- Player lookup by SteamID64, Steam/CSRep profile URL, Leetify profile URL, and FACEIT profile URL. Name autocomplete uses public Steam results when available and the signed-in player's public Steam friends as a fallback.
- CS2 share-code format recognition. Match statistics still require an imported demo or a connected match-data source; the public Steam API does not resolve match codes to stats.
- Search results open in an independent player viewer with Overview, Matches, Statistics and Reputation tabs. The connected account stays in the top bar and the dashboard does not switch.
- Official Steam ban records when `STEAM_API_KEY` is configured; evidence-linked community reports are labeled unverified.
- Optional, disabled-by-default CS2 Game State Integration (GSI) setup; shows live roster fields only when CS2 provides them.
- English / Brazilian Portuguese interface; language and training progress persist locally.
- Map, match-count and result filters; map search; match detail dialog.
- Aggregate K/D, win rate, round-weighted ADR and kill-weighted headshot percentage.
- Interactive K/D chart and map breakdown derived from the active selection.
- CSV export of real FACEIT results.
- Rule-based training guidance, explicitly distinguished from an AI assessment.
- Responsive keyboard-accessible layout, native dialog focus handling and reduced-motion support.

## Project status and remaining work

This repository is a prototype, not a verified live player-monitoring service. The following work remains before it can be presented as production-ready:

- **Validate live roster data in CS2.** The GSI configuration requests `allplayers_id` and `allplayers_match_stats`, but the payload has not been confirmed in a real Premier session. The current integration runs locally and requires manual GSI config installation and explicit activation. A hosted multi-user service needs an authenticated local companion to relay opted-in sessions.
- **Verify provider contracts end to end.** The Leetify adapter has not been exercised with a real account. The CSRep endpoint and match response schema still need confirmation; do not assume that a successful profile response contains match history.
- **Replace the reputation heuristic.** The public signal index uses hand-set weights and is not a calibrated prediction. Steam ban counts can refer to other games; community reports are unverified. Do not present this index as proof or a probability of cheating. A predictive model needs trusted labels, historical evaluation and measured false-positive rates.
- **Productionize community reports.** Reports currently live in a local JSON-backed store. Moderation, abuse prevention, retention controls, account deletion and a privacy policy are still needed before public deployment.
- **Rework the product UI.** The current interface is a prototype. Redesign it around a validated live match roster, player profiles, source provenance, data coverage and explicit opt-in setup.
- **Complete release verification.** The frontend production build passes. The backend has not been compiled in this environment because Maven was unavailable, and the full app has not been verified in Docker or against live provider credentials.

`.env` is ignored by Git. `.env.example` contains blank placeholders; never commit local API keys, Steam auth codes, session cookies or account data.

## Structure

```text
backend/
  src/main/java/dev/girolneto/cslab/
    Application.java        Spring Boot entry point
    PlayerController.java   Validated, read-only REST endpoints
    PlayerService.java      Steam / FACEIT adapters and bounded cache
    LiveGameStateService.java In-memory CS2 GSI state for the local dashboard
frontend/public/gamestate_integration_cslab.cfg  Downloadable local GSI configuration
frontend/
  src/main.tsx              Application screens and interactions
  src/data.ts               Types, aggregation, HTTP and CSV helpers
  src/i18n.ts               English and Portuguese copy
  src/styles.css            Responsive design system
  public/images/            Valve screenshots and asset attribution
compose.yaml                Local app with reverse proxy
```

A small modular monolith: one API and one frontend. Training progress is browser-local. The local reputation report store is a JSON file in a persistent Docker volume; it is not designed for a public multi-user deployment.

## REST API

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/v1/health` | Process health |
| GET | `/api/v1/players/{steamId}` | Public Steam identity |
| GET | `/api/v1/players/{steamId}/steam-data` | Official Steam game ownership/playtime and public CS2 aggregate stats |
| GET | `/api/v1/players/lookup?query=...` | Resolve SteamID64, Steam/CSRep URL, Leetify URL, or FACEIT URL (FACEIT resolution needs its key) |
| GET | `/api/v1/players/search?query=...` | Search public Steam results and, for signed-in users, their public friends |
| GET | `/api/v1/players/{steamId}/matches?source=faceit` | Recent FACEIT CS2 player results |
| GET | `/api/v1/players/{steamId}/reputation` | Steam ban record, unverified reports and public signal index |
| POST | `/api/v1/players/{steamId}/reputation/reports` | Submit an evidence-linked report while signed in with Steam |
| GET | `/api/v1/live` | Live opt-in state and latest local GSI roster/state |
| POST | `/api/v1/live/gsi` | Receive CS2 Game State Integration updates |
| POST | `/api/v1/live/enable` | Explicitly enable local GSI reception |
| POST | `/api/v1/live/disable` | Stop reception and clear in-memory live data |

Steam IDs must match `7656119[0-9]{10}`. Validation errors use HTTP 400. Missing FACEIT configuration returns 503; unavailable upstream data returns 502. Responses use Spring's Problem Details format. Upstream calls have connect/read deadlines. Responses are cached for five minutes with a bounded in-process cache.

Player profiles use a dedicated `/player/{steamId}` page. A missing match source is returned explicitly as unavailable; it does not mean the player has no matches. Valve supports sharing CS2 match history, including Premier, through a player-created Game Authentication Code; a public SteamID or Steam OpenID login alone does not authorize this access. The local imported match snapshot currently covers only profiles with a corresponding import file; Steam summaries/playtime and public aggregate game stats are fetched through Valve's API.

Public Steam XML and Community search are best-effort community endpoints rather than guaranteed analytics APIs. The XML parser disables DTDs and external entities. No arbitrary upstream URLs are accepted.

## Metric definitions and limits

- **K/D:** total kills divided by total deaths. Undefined denominators display `—`.
- **Win rate:** wins divided by selected matches.
- **ADR:** per-match ADR weighted by rounds played. Missing values are excluded.
- **Headshots:** per-match percentages weighted by kills; the source may round these values.
- **Sample:** newest N returned matches, then map/result/search filters. It is not a date range or lifetime record.

No invented ranks, aim scores, reaction times, heatmaps or utility metrics. Those need additional telemetry. Small map samples are not reliable skill estimates. Recommendations use transparent rules, not an LLM or proprietary rating. Valve's public Steam Web API does not expose CS2 Premier match history for arbitrary profiles. Valve's separate Game Authentication Code flow can authorize third-party match-history access for the player who grants it. Steam game details and aggregate CS2 stats are available only when the profile makes them public. Match-level analysis needs an authorized history/demo source; CSRep is optional.

## Security and operations

Same-origin API calls, server-only provider key, bounded cache, input validation, upstream timeouts, hardened XML parsing, non-root containers, HTTP security headers and basic reverse-proxy rate limiting. The default stack is for local use. Before exposing it publicly, provision TLS, stronger provider quotas, monitoring and authenticated access where needed.

Build commands:

```sh
cd frontend && npm run build
cd ../backend && mvn -DskipTests package
```

Automated tests are not included in this initial release. Use Conventional Commits for changes (`feat:`, `fix:`, `docs:`, `refactor:`).

## Artwork

Counter-Strike imagery and trademarks belong to Valve. This independent fan/portfolio project is not affiliated with Valve or FACEIT. See `frontend/public/images/ATTRIBUTION.txt` for asset sources. The MIT license covers original application code only, not third-party artwork or the player avatar.
