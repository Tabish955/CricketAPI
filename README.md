# CricketAPI

A personal, zero-dependency Node.js cricket API that aggregates **Cricbuzz** (modern web-app API + legacy `mapps` mobile API) and **ESPNcricinfo**, with the same route surface as the reference Cricbuzz proxy API.

> **Disclaimer:** This project is for **educational purposes only**. **Commercial or business use is prohibited.** It reverse-engineers publicly served endpoints for personal study; you are responsible for respecting the terms of service and rate limits of any upstream site.

## Quick start

```bash
npm start              # live mode: fetch upstreams, fall back to recorded fixtures
npm run start:fixtures # fixtures mode: serve only the recorded corpus (no network)
npm test               # run the test suite against the fixture corpus
```

Requires Node.js >= 18 (uses built-in `fetch`). No npm dependencies.

## Endpoints

### Cricbuzz (reference-API compatible)

| Route | Description |
| --- | --- |
| `GET /cb/live` | Live match list: `matchId`, `teams`, `scores[]`, `status`, plus self-referential `detail` / `scorecard` / `commentary` / `squads` links |
| `GET /cb/search?q=TEAM_OR_NAME` | Search across live + recent + upcoming matches |
| `GET /cb/match/:id` | Full match detail (toss, venue, officials, current batters/bowler). `?source=auto\|modern\|legacy` |
| `GET /cb/match/:id/scorecard` | Full scorecard (batting, bowling, extras, fall of wickets, partnerships). `?source=modern\|legacy` |
| `GET /cb/match/:id/commentary?page=0` | Ball-by-ball commentary (HTML stripped, events flagged) |
| `GET /cb/match/:id/squads` | Playing XIs + bench with player roles/styles. `?source=auto\|modern\|legacy` |
| `GET /cb/player/name?q=NAME` | Player lookup → `playerId` / `name` / `country` / `imageUrl` / `personalInfo` |
| `GET /cb/player/:id` | Player profile scraped from `/profiles/:id` (`personalInfo` label scanner) |
| `GET /cb/recent` · `GET /cb/upcoming` | Completed / scheduled match lists |
| `GET /cb/series/:id/matches` | Series fixture list |
| `GET /cb/series/:id/points-table` | Series points table |

### ESPNcricinfo

| Route | Description |
| --- | --- |
| `GET /cricinfo/current` · `/cricinfo/live` | Current / live match lists |
| `GET /cricinfo/scheduled?date=DD-MM-YYYY` · `/cricinfo/result?date=...` | Date-filtered lists |
| `GET /cricinfo/match/:id?seriesId=...` | Match details (requires `seriesId`, as the upstream API does) |

### Utility

| Route | Description |
| --- | --- |
| `GET /health` | Liveness + active data mode |
| `GET /` | Endpoint index + available fixture ids |
| `GET /img?u=<url>` | Image proxy, restricted to an allowlist of Cricbuzz/ESPN image hosts |

Every response carries `meta.source` (`live` or `fixture`) so you can always tell which path served it. In `auto` mode, live failures fall back to the recorded corpus and the fallback reason is reported in `meta`.

## Data modes

| Mode | Behaviour |
| --- | --- |
| `auto` (default) | Try live upstreams (timeout + retry), fall back to fixtures on failure |
| `live` | Live only; never serve fixtures |
| `fixtures` | Recorded corpus only; missing fixtures answer `404 NO_FIXTURE` instead of fabricating data |

## Response shape (reference compatible)

```json
{
  "success": true,
  "result": {
    "found": true,
    "count": 1,
    "matches": [
      {
        "matchId": "130069",
        "teams": "PAK vs IND",
        "scores": [{ "inningsId": 1, "team": "PAK", "score": "47/3", "overs": "8.6" }],
        "status": "Pakistan opt to bat",
        "detail": "http://localhost:3000/cb/match/130069",
        "scorecard": "http://localhost:3000/cb/match/130069/scorecard",
        "commentary": "http://localhost:3000/cb/match/130069/commentary",
        "squads": "http://localhost:3000/cb/match/130069/squads"
      }
    ]
  },
  "meta": { "dataMode": "auto", "primary": { "source": "live", "upstream": "..." } }
}
```

## Project layout

```
src/
  config.js      # env, upstream bases, headers, TTLs, image allowlist
  cache.js       # TTL cache + single-flight request coalescing
  http.js        # timeout/retry fetch, JSONP stripper, UpstreamError
  fixtures.js    # recorded-response registry (exact-id + flagged substitution)
  normalize.js   # all payload → unified-shape normalizers
  providers.js   # upstream calls with live→fixture fallback chain
  server.js      # zero-dependency HTTP router
fixtures/        # recorded upstream responses (see docs/REVERSE-ENGINEERING.md)
tests/           # node:test suite running against the fixture corpus
docs/            # reverse-engineering notes: endpoints, shapes, provenance
```

## Notes on correctness

- Fixtures are raw captures from public open-source projects; each is listed with its source repository in `docs/REVERSE-ENGINEERING.md`.
- When a route has no recorded fixture (e.g. player search in fixtures mode), the API returns `404` with `code: NO_FIXTURE` rather than inventing data.
- When a generic fixture substitutes for a different match id, `meta.substitutedForId` flags it explicitly.

## License / usage

UNLICENSED — personal educational project. **Commercial or business use is prohibited.**
