# CricketAPI

A personal Node.js cricket API that aggregates **Cricbuzz** (modern web-app API + legacy `mapps` mobile API) and **ESPNcricinfo**, with the same route surface as the reference Cricbuzz proxy API.

> **Disclaimer:** This project is for **educational purposes only**. **Commercial or business use is prohibited.** It reverse-engineers publicly served endpoints for personal study; you are responsible for respecting the terms of service and rate limits of any upstream site.

## Quick start

```bash
npm start              # auto mode: fetch current upstreams; no recorded-data fallback
npm run start:fixtures # fixtures mode: serve only the recorded corpus (no network)
npm test               # run the test suite against the fixture corpus
```

Requires Node.js >= 18 (uses built-in `fetch`). Run `npm ci` first; Cheerio parses independent-provider HTML.

## Deploy to Vercel

The repo is Vercel-ready — the same router runs as a single serverless function:

```bash
npm i -g vercel && vercel    # or import the GitHub repo in the Vercel dashboard
```

What makes it work:

- `api/index.js` (+ `api/[...path].js` catch-all) re-exports the core handler;
  `vercel.json` rewrites every root path (`/cb/live`, `/health`, …) to it, so
  public URLs stay **without** an `/api` prefix.
- `functions.*.includeFiles: "fixtures/**"` bundles the recorded corpus, since
  fixture files are opened dynamically and wouldn't be traced automatically.
- `maxDuration: 60` gives slow upstream chains room; lower it if your plan
  complains.

Environment variables to set in the Vercel project (optional):

| Var | Default | Note |
| --- | --- | --- |
| `DATA_MODE` | `auto` | `live` = never serve fixtures; `fixtures` = offline demo |
| `UPSTREAM_TIMEOUT_MS` | `8000` | Consider `5000` on serverless to fail faster |

Notes for serverless: the in-memory TTL cache lives per warm instance (that's
fine — it only shortens repeated calls), and each cold start re-reads the
fixture files from the bundle.

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

Every response carries `meta.source` (`live` or `fixture`) so you can always tell which path served it. In `auto` and `live` modes, failures never fall back to the recorded corpus. List routes try Cricbuzz → Cricinfo → ESPN public scoreboards → CREX; if all fail, the API returns an upstream error.

## Data modes

| Mode | Behaviour |
| --- | --- |
| `auto` (default) | Try current upstreams; return an error if all fail (never recordings) |
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
  providers.js   # upstream calls with live provider fallback chain
  server.js      # Node HTTP router
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

## Public ESPN endpoints

These routes use ESPN IDs (not Cricbuzz IDs). Match links include the required
league ID. Supply `date=YYYYMMDD` to look up a historical league scoreboard.

| Endpoint | Coverage |
| --- | --- |
| `GET /espn/live` | Currently in-progress matches from the multi-league header |
| `GET /espn/recent` | Completed matches in the current header window |
| `GET /espn/upcoming` | Scheduled matches in the current header window |
| `GET /espn/series/:id/matches?date=YYYYMMDD` | League scoreboard |
| `GET /espn/match/:id?league=ID&date=YYYYMMDD` | Teams, venue, innings, result and awards |
| `GET /espn/match/:id/scorecard?league=ID&date=YYYYMMDD` | Innings totals plus available individual batting/bowling stats from summary rosters |
| `GET /espn/match/:id/squads?league=ID` | Summary rosters if supplied upstream |
| `GET /espn/standings/:id` | Team standings: played, won, lost, points, NRR |

ESPN ball-by-ball is available at `GET /espn/match/:id/commentary?league=ID&page=1`
with upstream pagination (`pageCount`, `total`); page numbering starts at 1. Header coverage is a current
window, not a full cricket calendar; an empty list is possible. ESPN data is
fetched at request time and cached briefly. Reachability from research tooling
does not establish reachability from Vercel: deployment verification is still
required. Recorded ESPN responses are offline test inputs, **not a live feed**.
The `fixtures` mode deliberately retains historical demo data and must not be
used for a production live-score service.


## Independent provider: CREX

`GET /crex/live`, `GET /crex/recent`, `GET /crex/upcoming` parse the public SSR
schedule at `https://crex.com/schedule`. CREX IDs are not Cricbuzz/ESPN IDs.
Detail links point to CREX itself; no cross-provider ID guessing is performed.
Missing dates are `null` (display-only start text is retained). Unsupported
markup returns an upstream error, never fabricated matches or offline data.
This adapter is also the fourth `/cb/*` list fallback after Cricbuzz, Cricinfo
and ESPN. It is never merged with a successful higher-priority provider. Parser tests use synthetic
selector-contract samples, not a captured live HTML fixture.

ESPN scorecards now inspect summary roster **per-innings** statistics for runs,
balls, boundaries, strike rate, dismissal, overs, wickets, conceded runs and
economy. Coverage is explicitly reported; if summary fails the response preserves
scoreboard innings totals with a warning. No career totals or nested per-over
records are mixed into innings statistics.


### Runtime provider diagnostics

`GET /sources/status` reports whether the ESPN and CREX adapters currently return
parseable data, their upstream URLs, fetch times and failures. A successful HTTP
response from this diagnostics route does **not** mean every source is healthy;
check each entry's `available` field. In offline fixtures mode it reports test
recordings as such. No arbitrary probe URLs are accepted.


Live ESPN scoreboard totals and embedded player statistics have 10-second cache
TTLs. Squad metadata retains a separate 5-minute cache and cannot freeze the
scorecard. Commentary has a 20-second cache. Upstream response-body reads are
covered by the request timeout as well as connection/header reads.

### Checked deployment progress

Production after PR #3: current live/finished/upcoming lists, match details and
ILT20 standings returned `source: live`. PR #4 preview additionally returned
individual batting/bowling tables and paginated commentary. CREX preview lists
were verified for all three categories. See `docs/LIVE-VERIFICATION.md` for
specific evidence and limitations. Build success alone is not data verification.
