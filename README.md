# CS2 Performance Lab

A personal Counter-Strike 2 analytics workspace built with Java 21, Spring Boot, React and TypeScript. Public Steam identity, source-aware match analytics, interactive charts and a focused training checklist. Available in English and Brazilian Portuguese.

**Real data only:** no fabricated matches, sample statistics or saved identity fallback. Public profiles come from Steam; match history comes from FACEIT when configured. Missing data stays unavailable. The default player is `76561198103634204`; use the player search to open another profile.

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
- Search by SteamID64 or Steam profile URL (including `/id/` vanity URLs).
- Names link to Steam people search, which may require sign-in. Paste a result’s profile URL to open it in the app. Name results are not scraped or invented.
- English / Brazilian Portuguese interface; language and training progress persist locally.
- Map, match-count and result filters; map search; match detail dialog.
- Aggregate K/D, win rate, round-weighted ADR and kill-weighted headshot percentage.
- Interactive K/D chart and map breakdown derived from the active selection.
- CSV export of real FACEIT results.
- Rule-based training guidance, explicitly distinguished from an AI assessment.
- Responsive keyboard-accessible layout, native dialog focus handling and reduced-motion support.

## Structure

```text
backend/
  src/main/java/dev/girolneto/cslab/
    Application.java        Spring Boot entry point
    PlayerController.java   Validated, read-only REST endpoints
    PlayerService.java      Steam / FACEIT adapters and bounded cache
frontend/
  src/main.tsx              Application screens and interactions
  src/data.ts               Types, aggregation, HTTP and CSV helpers
  src/i18n.ts               English and Portuguese copy
  src/styles.css            Responsive design system
  public/images/            Valve screenshots and asset attribution
compose.yaml                Local app with reverse proxy
```

A small modular monolith: one API, one frontend, no database required. Training progress is browser-local and not shared across devices. Avoiding accounts and a database keeps the current read-only analytics scope simple. Add server persistence when there is a real multi-user requirement.

## REST API

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/v1/health` | Process health |
| GET | `/api/v1/players/{steamId}` | Public Steam identity |
| GET | `/api/v1/players/lookup?query=...` | Resolve a SteamID64 or validated Steam profile URL |
| GET | `/api/v1/players/{steamId}/matches?source=faceit` | Recent FACEIT CS2 player results |

Steam IDs must match `7656119[0-9]{10}`. Validation errors use HTTP 400. Missing FACEIT configuration returns 503; unavailable upstream data returns 502. Responses use Spring's Problem Details format. Upstream calls have connect/read deadlines. Responses are cached for five minutes with a bounded in-process cache.

Public Steam XML is a best-effort community endpoint rather than a guaranteed analytics API. Its XML parser disables DTDs and external entities. No arbitrary upstream URLs are accepted.

## Metric definitions and limits

- **K/D:** total kills divided by total deaths. Undefined denominators display `—`.
- **Win rate:** wins divided by selected matches.
- **ADR:** per-match ADR weighted by rounds played. Missing values are excluded.
- **Headshots:** per-match percentages weighted by kills; the source may round these values.
- **Sample:** newest N returned matches, then map/result/search filters. It is not a date range or lifetime record.

No invented ranks, aim scores, reaction times, heatmaps or utility metrics. Those need additional telemetry. Small map samples are not reliable skill estimates. Recommendations use transparent rules, not an LLM or proprietary rating. Demo parsing, Premier history, authentication, shared training storage and AI-generated coaching are not implemented.

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
