# School presentation: endpoint audit and integration readiness

> **Follow-up on this branch:** the original deployed-baseline audit below is
> historical. Raw ESPN summary research subsequently found extras, FOW and
> partnerships; normalization is now implemented locally. A separate experimental
> Sportskeeda standings route has also been added (season unverified). See
> [follow-up research](INNINGS-AND-STANDINGS-RESEARCH.md) for contracts and release
> status. These changes must not be mistaken for already-verified deployment.

## Executive result

Base URL: **https://cricketapi-beryl.vercel.app** (no `/api` prefix).
Code baseline: main merge `8b9a988` (PR #4). Audit performed in this session;
returned service `fetchedAt` timestamps include `2026-11-26T08:34Z` onwards.
These are observed service timestamps, not a guarantee of the upstream clock.

- All **32 advertised route entries**, plus `/` and `/index.json`, were probed:
  **34 route templates/aliases**, using representative parameters, not every ID.
- **22** returned usable successful JSON in the external fetch probes.
- **11** data routes did not return a usable response; exclude from the critical
  presentation path unless they are separately repaired and reverified.
- **1** image route is unsuitable for the ESPN logo URL used by our primary feed.
- The external page-fetch tool hides most non-success HTTP statuses/bodies. A
  failed probe below means **not verified usable**, not a fabricated HTTP code or
  proof of permanent downtime. Provider-chain metadata separately confirms
  Cricbuzz JSON 404 and hs-consumer Cricinfo 403 on list requests.
- `npm ci`: successful, audit reported 0 vulnerabilities at execution.
- `npm test`: **37/37 passed**. These are offline/mocked regression tests, not
  37 successful production endpoints.
- Added repeatable `scripts/audit-endpoints.mjs`: exercised all 34 route samples
  and 9 input/method checks locally (43 probes, explicitly offline fixtures).
  All nine checks returned their expected 400/403/404/204/405 statuses.

## Full live-probe inventory

**OK** = successful JSON and usable sample content. **Unusable probe** = fetch
failed without a readable response; exact HTTP status unobserved unless stated.
All paths below are GET; relative to the base URL.

| # | Route template | Sample / observation | Result |
|---|---|---|---|
| 1 | `/` | Endpoint index, mode auto, educational disclaimer | OK |
| 2 | `/index.json` | Same endpoint inventory | OK |
| 3 | `/health` | status ok, mode auto | OK (liveness only) |
| 4 | `/sources/status` | ESPN available: 17 live; CREX available: 20 schedule entries | OK; inspect each source, not just outer success |
| 5 | `/cb/live` | `q=1544877`: WA–TAS, Tasmania 342/10 & 229/7, source live | OK via ESPN fallback |
| 6 | `/cb/recent` | `q=Mumbai`: match 1546783, Mumbai won by 86 runs | OK via ESPN fallback |
| 7 | `/cb/upcoming` | `q=Gujarat`: GUJ–GOA, scheduled | OK via ESPN fallback |
| 8 | `/cb/search?q=...` | Mumbai result, returned ESPN detail URL | OK; searches current window, not career/all-history search |
| 9 | `/cb/match/:id` | Cricbuzz ID 165221; auto and explicit modern/legacy probes | Unusable probe |
| 10 | `/cb/match/:id/scorecard` | 165221; default and legacy | Unusable probe |
| 11 | `/cb/match/:id/commentary` | 165221, page=0 | Unusable probe |
| 12 | `/cb/match/:id/squads` | 165221; auto and legacy | Unusable probe |
| 13 | `/cb/player/name?q=...` | Virat Kohli | Unusable probe |
| 14 | `/cb/player/:id` | 265 | Unusable probe |
| 15 | `/cb/series/:id/matches` | Cricbuzz series 12420 | Unusable probe |
| 16 | `/cb/series/:id/points-table` | Cricbuzz series 12037 | Unusable probe |
| 17 | `/cricinfo/current` | 30 current entries from fallback; missing team images | OK, alternate shape, avoid as primary UI feed |
| 18 | `/cricinfo/live` | 17 current entries from fallback | OK, alternate shape |
| 19 | `/cricinfo/scheduled?date=DD-MM-YYYY` | 26-11-2026 | Unusable probe |
| 20 | `/cricinfo/result?date=DD-MM-YYYY` | 26-11-2026 | Unusable probe |
| 21 | `/cricinfo/match/:id?seriesId=...` | 1546783, Cricinfo series 1546522 | Unusable probe |
| 22 | `/espn/live` | 17 live/in-progress matches | OK |
| 23 | `/espn/recent` | 6 results | OK |
| 24 | `/espn/upcoming` | 7 scheduled matches | OK |
| 25 | `/espn/match/:id?league=&date=` | 1546783, league 8661, date 20261126; venue, award, two innings | OK |
| 26 | `/espn/match/:id/scorecard?league=&date=` | Same IDs; Musheer Khan 65 off 40; batting/bowling tables | OK; coverage varies by match |
| 27 | `/espn/match/:id/squads?league=` | Same IDs; two squads, 11 players each | OK |
| 28 | `/espn/match/:id/commentary?league=&page=` | Same IDs, page 2; 25 deliveries, 10 pages, 227 total | OK; correct cumulative 65/0 → 66/0 |
| 29 | `/espn/series/:id/matches?date=` | League 8661, date 20261126; 16 matches | OK; a dated scoreboard, not proven full-season archive |
| 30 | `/espn/standings/:id` | 20921; six teams, rank/played/wins/losses/points/NRR | OK; bilateral series can have no table |
| 31 | `/crex/live` | 11 live entries | OK; limited fields, no team image URLs |
| 32 | `/crex/recent` | 4 results | OK; upstream status can lag other sources |
| 33 | `/crex/upcoming` | 5 entries, display-only times | OK; unknown absolute date/timezone remains null |
| 34 | `/img?u=` | ESPN logo URL host a.espncdn.com; also allowlisted Cricbuzz image sample | Not presentation-ready: ESPN host rejected by code; Cricbuzz image probe failed |

Counts change while auditing; do not hardcode them into the website. A filtered
empty response is not an outage: the WBBL match and Chandigarh fixture initially
queried were no longer in live/upcoming respectively. Retesting with actual
current-list matches returned usable content.

## Flags and logos: real gap to handle

Primary `/cb/*` fallback and `/espn/*` lists return `team1.imageUrl` and
`team2.imageUrl`, commonly at `https://a.espncdn.com/i/teamlogos/cricket/500/...`.
The `/img` allowlist **does not contain that host**. Code inspection proves the
proxy rejects it (403 path), even though the page-fetch tool hid the response.
Binary-image page fetches are not a browser rendering test; this audit did NOT
prove every image URL loads visually.

Use supplied image URLs directly in the website with `object-fit: contain`,
alt text, fixed dimensions, lazy loading outside the hero, and onError fallback.
Do not route them through the existing API image proxy. Test rendering in a real
browser. Standing/squad/CREX responses omit logos; join a team-asset registry
using **provider + team ID** when possible. Name aliases must be manually
confirmed; never collapse A, women, U19, state and national sides.

A matching verified official crest/flag can be a local educational asset with
source attribution. If unavailable, show a tasteful abbreviation badge, clearly
a fallback, not a fabricated official logo. Every team can have a rendered
identity mark; **every official flag/logo is not currently guaranteed**.

## Feasible scope in three days

### Build the critical demo path

1. Live/recent/upcoming cards and local format/series/team filters.
2. Detail page with summary, scorecard, commentary pagination, squads.
3. Series pages built from discovered series plus dated ESPN match lists.
4. Standings with proper empty/no-table state.
5. Teams directory and team pages derived from available matches/squads.
6. Match-player pages showing only observed match statistics and role/styles;
   clearly distinguish them from career profiles.
7. Match search, favorites, timezone display, theme and provider diagnostics.
8. Short-interval polling, last-success timestamps and honest stale/error UI.
9. Team identity images/fallback marks and mobile/keyboard accessibility.

### Conditional / unavailable data, not a license to invent

ICC rankings, career records/profiles, exhaustive player search, full historical
archives, complete future calendars, official tournament-leading stats, wagon
wheels, pitch maps, ball tracking, venue histories, proprietary win probability,
fantasy points and video streams are **not established by this API**. Extras,
fall of wickets and partnerships are not guaranteed in the working ESPN
normalization. News is explicitly excluded by the user. Expose optional features
only after separately verifying a permitted source and contract. Otherwise show
honest unavailable states or omit navigation; never populate believable fakes.

Derived visualizations may use verified complete commentary; label partial data
and sampled match-only aggregates. Never label current-window team/player
aggregates as career/tournament statistics.

## Refresh behavior

This is pull-based, not a subscribed upstream event stream. Polling does not
provide instantaneous provider synchronization. Relevant cache TTLs:

| Data | API TTL / frontend guidance |
|---|---|
| `/cb/live` or `/espn/live` | 15 s; poll visible active list about 15 s |
| `/cb/recent` | 60 s; poll about 60 s |
| `/cb/upcoming` | 120 s; poll about 120 s |
| ESPN detail/scorecard | 10 s; poll active live match about 10 s |
| ESPN commentary | 20 s; refresh latest discovered page about 20 s |
| ESPN squads, standings | 300 s; fetch on entry and about 5 min if visible |
| Diagnostics | On explicit open; do not continually poll every provider |

Nominal display lag includes upstream publication delay + server cache age +
frontend polling/network time. Timers are not freshness SLAs. Show both fetched
and last-success times; an unchanged score is normal at breaks/stumps. Do not
update the last-success clock after a failed request or infer match state only
from scheduled time. Pause hidden-tab polling and back off on failures.

## Repeatable checks before presentation

From a network-enabled computer:

```bash
npm ci
npm test
node scripts/audit-endpoints.mjs --out=endpoint-audit.json
```

The audit script discovers a recent ESPN match when possible, samples all 34
routes, records exact HTTP statuses, timing/CORS/meta and nine negative/method
checks. Some legacy sample IDs/dates remain explicit examples when discovery
fails. It is a diagnostic recorder, not an assertion that all samples should
return 200. Inspect content, coverage and metadata. This sandbox cannot directly
reach Vercel using Node fetch, so the production audit here used external fetch
tools and the script itself was executed only in clearly labeled offline mode.

Presentation backup: save permitted current responses shortly before class,
with capture times. Serve them only in an explicitly selected **Recorded demo**
mode; never make a recorded score appear live. Keep a completed match with full
scorecard/commentary available if no live match is scheduled at presentation time.
