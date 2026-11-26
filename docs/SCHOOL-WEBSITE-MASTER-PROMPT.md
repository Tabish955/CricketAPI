# COPY EVERYTHING BELOW INTO A NEW ARENA AGENT MODE CHAT

Act as a senior full-stack developer, UI/UX designer, test engineer and responsible reverse engineer. Build and run a complete cricket website for my school presentation, due in THREE DAYS. Work in the repository assigned to this new chat. Do not just give me a plan or a static mockup: implement, run, test and present the working website.

## API update: verify deployment before relying on extended fields

A follow-up backend branch implements ESPN innings `extras`, `fallOfWickets`
and `partnerships`. These fields were found in the raw upstream summary, but
new deployed behavior was not yet verified when this prompt was updated.
Inspect the actual production response first. Render these sections when present;
`null` means unavailable, and `[]` means an explicitly supplied empty list.

Each `result.innings[]` may include:
- `extras: {total, byes, legByes, noBalls, wides, penalties} | null` (nullable numbers).
- `fallOfWickets: [{wicketNumber, overs, runs, type, batsman:{id,name}, batsmanRuns, ballsFaced}] | null`.
- `partnerships: [{wicketNumber, type, runs, overs, runRate, start:{overs,runs,wickets}|null, end:{overs,runs,wickets}|null, batsmen:[{id,name,runs,balls}]}] | null`.

ESPN standings now also preserve team `imageUrl`, group season and `displayStats`
when that version is deployed. Standings for league 8661 were additionally observed.

Experimental additional provider route (verify deployed availability):
`GET /sportskeeda/series/:slug/points-table`, e.g. `syed-mushtaq-ali-trophy`.
Response: `result.{provider,seriesSlug,title,season,seasonVerified,warnings,groups}`;
`groups[].entries[]` has `{team:{id,name,short,imageUrl},stats}` with normalized
numeric P/W/L/NR/Pts/NRR keys matching ESPN. It is source-specific, NOT an automatic
cross-provider fallback. It returns `seasonVerified:false` and warnings because
public page season labels can conflict; never present it as a verified current
table or mix its IDs with ESPN. The adapter's live deployment remained unverified
at this prompt update. Prefer verified ESPN tables for the critical demo path.

The conservative missing-data rules below apply when fields are actually absent,
not as a reason to hide newly supplied sections.

## 1. Purpose and non-negotiable honesty

This is a school project for educational presentation only. Commercial/business use is prohibited. No advertising, payments, betting, gambling links, user tracking or monetization. Display a discreet persistent disclaimer: “School project · Educational presentation only · Commercial use prohibited. Cricket data and team marks belong to their respective owners. Not affiliated with Cricbuzz, ESPNcricinfo or CREX.” Include source attribution on About/Data Sources.

Create an ORIGINAL brand, e.g. “BoundaryBoard”, with a professional cricket-first design inspired by the functionality—not copied branding, page text or artwork—of major cricket sites. NO NEWS: no news feed, news links, article pages, headlines, news placeholders or fake stories.

My goal is broad functionality like Cricbuzz/Cricinfo. Important: the existing API does NOT expose every feature those products have. Implement ALL genuinely supported non-news features, build a feature/data-coverage matrix, and clearly document gaps. Never invent career records, rankings, official logos, commentary, scores, full calendars, toss/official details, extras, partnerships or player biographies. Do not claim complete feature parity or instantaneous synchronization. An educational purpose does not override access controls, copyright or provider terms. Do not bypass authentication/paywalls/anti-bot protections or use leaked keys.

## 2. Existing API: exact integration facts

Production base:

`https://cricketapi-beryl.vercel.app`

There is NO `/api` prefix on this upstream base. No API key is required. `/health` proves liveness, not feed correctness. Root `/` lists routes. `/sources/status` reports ESPN/CREX availability; inspect each `sources[].available`, not just outer `success`.

The API's list chain is Cricbuzz → Cricinfo → ESPN public scoreboards → independent CREX. Production auto/live modes do NOT fall back to recordings. If all sources fail, expect an error.

Audit evidence (point-in-time, not future guarantees):
- Core `/cb/live`, `/cb/recent`, `/cb/upcoming`, `/cb/search` returned current ESPN-fallback data with live metadata.
- `/espn/live`, `/espn/recent`, `/espn/upcoming` worked.
- ESPN match detail, individual batting/bowling scorecards, compact squads, paginated ball-by-ball, dated league matches and standings worked.
- `/crex/live`, `/crex/recent`, `/crex/upcoming` worked independently, but contain fewer fields.
- `/cricinfo/current` and `/cricinfo/live` worked through fallback but have a different shape and missing images; do NOT prefer them over the main feed.
- Original `/cb/match/:id` and its subroutes, `/cb/player/name`, `/cb/player/:id`, `/cb/series/*`, date-filtered Cricinfo routes and `/cricinfo/match/*` failed live audit probes. Do not make these a critical dependency or blindly retry them forever.
- Do not assume every discovered match has detailed stats or commentary. Check content and `coverage` per match.
- The API has 37 passing regression tests; that does NOT mean every production endpoint works.

Before building, fetch root, health, sources/status and list samples using available tools. Inspect real schemas. If this sandbox blocks the host, distinguish that from an API outage, document it, and provide honest explicit demo data for development while preserving the real runtime integration. Never claim a blocked network request was successfully verified. Do not spend the whole deadline on reverse engineering.

### Recommended endpoints

Lists and search:
```
GET /cb/live
GET /cb/recent
GET /cb/upcoming
GET /cb/search?q=TEAM_OR_MATCH_NAME
GET /espn/live
GET /espn/recent
GET /espn/upcoming
GET /crex/live
GET /crex/recent
GET /crex/upcoming
```

ESPN details (IDs are ESPN IDs; `league` is REQUIRED):
```
GET /espn/match/:matchId?league=:leagueId&date=YYYYMMDD
GET /espn/match/:matchId/scorecard?league=:leagueId&date=YYYYMMDD
GET /espn/match/:matchId/squads?league=:leagueId
GET /espn/match/:matchId/commentary?league=:leagueId&page=1
GET /espn/series/:leagueId/matches?date=YYYYMMDD
GET /espn/standings/:leagueId
```

Use API-returned `detail`, `scorecard`, `commentary`, `squads` URLs as authoritative. Preserve query strings. DO NOT route an ESPN ID into `/cb/match/:id`. DO NOT confuse ESPN league IDs with Cricinfo series IDs or Cricbuzz series IDs. Example: ESPN league 8661 is NOT Cricinfo series 1546522. Namespace caches, routes, favorites and asset keys by provider + ID. Parse the provider identity and league from the returned link, not merely the API route name or match ID.

CREX IDs are alphanumeric. CREX `detail` points to an external CREX web page, NOT our API JSON. Render a graceful limited-coverage card or external “View on source” link with external-link labeling, `target="_blank" rel="noopener noreferrer"`; never fetch that HTML as JSON or pretend internal scorecards exist.

Historical integration test example only, NEVER seed the whole site around fixed IDs:
- ESPN match `1546783`, league `8661`, date `20261126`.
- It had Mumbai 209/10 vs Uttarakhand 123/10, Musheer Khan 65 off 40, full squads and commentary.
- `/espn/standings/20921` returned ILT20 standings.
Discover live/current examples dynamically on startup. A fixed example belongs only in an explicitly labeled completed-match demo/test.

### Actual response contracts to normalize

Main list routes:
```ts
{
  success: true,
  result: { found: boolean, count: number, matches: MatchListItem[] },
  meta: { dataMode: string, primary?: Provenance, source?: Provenance, legacy?: unknown }
}
// MatchListItem fields:
{
  matchId: string,
  teams: string,                  // display string, not an array
  team1: { id: string, name: string, short: string, imageUrl?: string },
  team2: { id: string, name: string, short: string, imageUrl?: string },
  scores: Array<{ inningsId?: number, team: string, score: string, overs: string, declared?: boolean }>,
  category: 'live'|'recent'|'upcoming', live: boolean,
  status: string, state: string, stateTitle: string,
  series: string, seriesId: string, format: string,
  venue: { ground: string, city: string, country?: string },
  startDate: number|null, endDate: number|null, // epoch MILLISECONDS
  source: string,
  detail?: string, scorecard?: string, commentary?: string, squads?: string, upstream?: string,
  startTimeText?: string          // CREX: display-only; timezone/date unknown
}
```

ESPN match detail: `result.match`. Here `series` is `{ id, name }`, unlike lists! Contains `team1`, `team2`, `scores`, `venue`, `playerOfTheMatch: string[]`, status/category and links. Preserve richer list fields (e.g. format) when detail omits them, but NEVER overwrite newer scores with older list data.

ESPN scorecard: `result = { matchId, innings: [...], coverage, warnings? }` (NOT `result.scorecard`). Each innings has `inningsId, team, score, overs, declared` and, where available:
- `batsmen[]`: `id, name, teamId, position, runs, balls, fours, sixes, strikeRate, dismissal, isBatting`.
- `bowlers[]`: `id, name, teamId, overs` (string), `maidens, runs, wickets, economy, wides, noBalls`.
These arrays can be empty or absent when only totals are available. `0` is real data; missing is not `0`. Do not render “not out” unless supplied. Follow coverage/warnings rather than claiming a full scorecard for a totals-only result.

Squads: `result = { matchId, teams: [{ teamId, teamName, players: [{ id, name, role, isCaptain, isStarter, battingStyle, bowlingStyle }] }] }`. Role may be “Unknown”. A starter flag is provider information, not a guessed playing XI. No guaranteed player portrait or career profile endpoint.

Commentary: `result = { matchId, page, pageSize, pageCount, total, commentary: [{ id, inningsId, over, ball, event, text, runs, batsman, bowler, score, wicket }] }`. Page numbering starts at **1**. API example returned pageSize 25. `over` may be a number, and `score` is cumulative. Page 1 is NOT necessarily the newest delivery! Preserve upstream ordering and inspect `pageCount`. Fetch page 1 for pagination metadata, then the latest nonempty page when needed; preserve the user's historical page/scroll position. Recheck pageCount when polling, dedupe by provider/match/innings/play ID, and fetch only the tail pages on refresh. Don't download all pages every 20 seconds. Empty/unavailable commentary must not break the scorecard.

Series matches: `result = { count, matches }`, with list-shaped matches. This is a dated scoreboard, not proof that the entire season is included. Label “Matches for selected date”; derive available series from current match lists, not a fabricated complete global directory.

Standings: `result = { leagueId, season, groups: [{ name, entries: [{ team: { id,name,short }, stats: { rank,matchesPlayed,matchesWon,matchesLost,noresult,matchPoints,matchesTied,netrr,... } }] }] }`. Dynamic columns/nullable fields; preserve group names and provider ranks. Empty tables are valid for bilateral series. Do not construct official tables from a partial match list.

Search: `result.matches[]` is a REDUCED shape (ID, teams display string, status, live, detail URL, series name). Enrich from the local index or fetch detail; do not assume it has team1/team2, flags or score arrays.

Provenance is nested: list `meta.primary`, most ESPN routes `meta.source`, scorecard may include `meta.source.playerStatistics`. Provenance fields include `source: 'live'|'fixture'`, `upstream`, `fetchedAt`, `cached`. Match `source: 'espn-site'|'crex'|...` is provider identity, NOT a freshness timestamp. Upstream errors can exist even when fallback succeeded. Render fallback success normally, diagnostics separately.

Use real `&` in URLs. Markdown fetch tools may render `&region` as a special entity; don't copy those artifacts into code.

## 3. Implementation and deployment architecture

Inspect the new repository first; reuse a suitable existing stack. If blank, use a stable Next.js + TypeScript + Tailwind stack with a query library (TanStack Query or SWR), schema validation and an accessible component system. Use current compatible stable versions and a lockfile. Do not waste time migrating a working app.

Create a typed API adapter layer and provider-specific normalization, not fetch calls scattered across UI components. Validate responses and both HTTP status and `success`. Treat empty arrays as valid empty states, not exceptions. Render text safely; no raw upstream HTML injection.

Prefer a SAME-ORIGIN website backend adapter with a fixed upstream base, e.g. browser `/api/cricket/...` → production API. Allowlist path patterns and safe query keys, enforce GET, request timeouts, response size bounds, and refuse arbitrary URL/host/port/redirect proxying. Use `cache: 'no-store'` and avoid Next fetch/CDN caching that would freeze live data on top of API caches. No credentials are needed. Don't leak server secrets or create an open SSRF proxy. Do not reimplement the cricket backend or scrape upstream hosts directly from the browser.

Validate returned API links against the production API origin before proxying. External provider links are rendered as external links only. Browser code must not call localhost to reach a sandbox backend. Bind preview servers to `0.0.0.0` and accept Arena preview hosts. Use the platform process tools to keep a live preview running. Test direct reload of nested routes, not just navigation from home.

## 4. Pages and supported feature set

Build these as REAL functional pages, not decorative placeholders:

1. **Home / Live center:** live/recent/upcoming tabs, compact match carousel or grid, search, format/series/team filters, clear live/innings-break/stumps/result badges, complete score strings, venue and times when known. Prefer main `/cb/*` feed; show provider and fetched time unobtrusively. Don't duplicate the same matches by merging ESPN/CREX indiscriminately.
2. **Match center:** persistent score header with team identity marks; Overview, Scorecard, Commentary, Squads and applicable Table tabs. Dynamic capability/coverage states. Overview includes source-supplied status, ground/city/country, start date and award. No fabricated toss/weather/officials.
3. **Scorecard:** all available innings, full batting/bowling tables, accessible horizontal scrolling on mobile, sticky headings, null-safe numerical fields, declarations, correct batting order. Show missing extras/FOW/partnerships as unavailable, not invented zeroes. Never assume two innings: Tests may have four.
4. **Commentary:** chronological/reverse display toggle if robustly normalized, event chips (4/6/wicket), innings selector, server pagination/load-more, selected-page indicator, jump-to-latest, manual refresh. No fake auto-generated play text. Keep scores readable during background requests.
5. **Squads:** team tabs/cards, captain and starter labels, roles and handedness/styles, source coverage notice. No fabricated player bios/portraits.
6. **Series:** directory of series discovered from current feeds; per-series dated fixtures/results and standings where available. Real date picker using `YYYYMMDD`. Do not market it as an exhaustive archive/calendar.
7. **Teams:** directory/search of discovered teams, provider-scoped team page with observed fixtures/results, identity mark and available squad players. Clearly scoped to available data.
8. **Players:** match-derived player cards/pages with role/styles and observed MATCH batting/bowling stats. Label scope and match. Do not call these complete career profiles or expect the failed player search API to work. You may add verified player-profile support only if separately integrated and tested within the deadline; otherwise explain the limit cleanly.
9. **Standings:** groups/rank/P/W/L/T/NR/Pts/NRR, responsive tables, selected series, correct no-table state. Source-provided rankings only.
10. **Search:** debounce at least 350 ms, cancel old requests, support match/team/series names across locally loaded current data. Server match search is optional enrichment; don't pretend it's universal player or historical search.
11. **Favorites:** browser-local favorite teams/matches, persisted with safe storage and provider-scoped keys. No login required. Favorites with no current feed entry show last-known timestamp and a retry action.
12. **About / Data sources:** school disclaimer, attribution, refresh explanation, coverage matrix and user-triggered source diagnostics. No constant diagnostic polling.

For international/women/domestic/U19 filters, use explicit reliable metadata where present. Do not infer categories from fragile substrings and present them as official classifications. Format labels can be empty; show All/Unknown appropriately.

### Unsupported major feature families

Record these in a coverage document: ICC rankings, career records, exhaustive archives, complete season leaders, official head-to-head histories, venue histories, ball tracking/pitch maps/wagon wheels, proprietary win predictions, streaming/video, fantasy/betting products. They are not established by this API. Omit unavailable menu items or present a clear coverage explanation; do not ship dead interactions. No news under any circumstances.

Optional charts (run progression, Manhattan, wickets timeline) may be derived only from actual commentary with correct innings and legal-ball handling. Label “partial commentary data” unless all necessary pages are fetched and validated. Prioritize core functionality over these charts. Do NOT fabricate missing ball locations or interpolate them as real tracking data. Overs are cricket notation: 19.5 = 19 overs and 5 balls, not 19.5 arithmetic overs. Extra deliveries and no-balls/wides require proper handling. Prefer supplied rates to recalculations when semantics are uncertain.

## 5. Live updates: precise behavior

This API is POLLING, not WebSocket/SSE. “Updates when our provider updates” means automatic periodic re-fetch with acknowledged latency, not an instant push guarantee.

Use visible-tab, route-aware query intervals:
- Active live list: about 15 seconds.
- Active live match detail and scorecard: about 10 seconds.
- Live commentary tail/pagination metadata: about 20 seconds.
- Recent lists: about 60 seconds; upcoming lists: about 120 seconds.
- Squads/standings: on entry, then about 5 minutes if still visible.
- Completed matches: no rapid polling; refetch on focus/manual refresh, or slowly.
- Pause background polling in hidden/offline tabs; refresh on return/reconnect.

API caches contribute approximately 10s for live scorecards/detail, 15s live lists, 20s commentary, 60s `/cb/recent`, 120s `/cb/upcoming`, 300s squads/standings. Network/upstream delays are additional. No stale-while-revalidate layer may mislabel old data as fresh.

Coalesce/deduplicate queries, cancel on route changes, prevent overlapping requests, use exponential backoff with jitter on failures (e.g. 15/30/60s), respect Retry-After when available, and cap request concurrency. A slow cold-start request can take tens of seconds: show a meaningful loading/retry UI, not an immediate false no-matches screen.

Track separately:
- provider `fetchedAt` if supplied;
- actual last successful website fetch;
- whether currently refreshing;
- stale/error/recorded status.
Do not reset last-success time on failure. Keep last good data with a conspicuous stale/offline badge instead of clearing scores. A stable score at drinks, rain or stumps is not proof of an outage. Do not simulate score increments or use animation as evidence of a new delivery. Respect provider state; do not infer completion merely because a scheduled end time passed.

Test the update mechanism with a controlled mock that changes payload on the second poll. Also observe a real live match twice if possible. An unchanged real score is inconclusive, not a failed polling test.

## 6. Every team gets an identity mark; official-image limitations

Use one reusable `TeamIdentity` component EVERYWHERE (cards, match headers, scorecards, squads, standings, team directory and favorites).

Priority:
1. API-supplied `team.imageUrl` from the primary match feed.
2. Asset registry keyed by provider + team ID, populated from previously fetched verified match/detail team metadata. Squad/standings responses omit logos; reuse by exact provider/ID.
3. Manually verified local official crest/flag with source attribution, when lawfully usable for education.
4. Attractive local abbreviation/monogram badge, explicitly a fallback, never presented as an official crest.

Never assign a national flag to a domestic/state/franchise team or merge women/U19/A teams into the senior men's identity. Do not guess a new remote image URL from an ID. CREX currently has no image fields; don't fabricate official logos for it. Every card must render an identity mark even when an official asset is unavailable; disclose that universal official-logo coverage is not guaranteed.

IMPORTANT: our API `/img` does NOT allow `a.espncdn.com`, the host used in primary team image URLs. Use valid supplied image URLs directly with a normal `<img>` (or configure the framework image component appropriately). Do not send them through the broken/incompatible proxy, and do not require cross-origin fetch just to display an image. Use HTTPS, fixed width/height, `object-fit:contain`, alt text, lazy loading as appropriate, and a single-shot `onError` fallback that cannot loop.

Run real browser checks for logo rendering on home, match, squad and standings pages. A URL in JSON is not proof an image renders. Test with images deliberately blocked to ensure there are no broken image icons/layout shifts.

## 7. Visual design and accessibility

Design a polished, original, score-first sports product, not a generic marketing landing page. Suggested direction: deep navy/forest header, warm white surfaces, restrained emerald live indicators and amber highlights; optional dark mode. Use crisp typography, tabular numerals, compact tables, clear hierarchy and generous but efficient spacing. Let scores—not giant empty hero art—dominate.

Responsive at 360px, tablet, desktop and a classroom projector. Sticky but non-obstructive match header, keyboard-usable tabs/filters, visible focus, semantic headings/tables, adequate contrast, reduced-motion support, no color-only status indicators. Avoid incessant screen-reader announcements on every poll. Keep page scroll position stable during updates; highlight changed values briefly and subtly.

No nonfunctional buttons, fake notifications, filler paragraphs, fabricated statistics, infinite loading, broken routes or console errors. Friendly empty/loading/error/limited-coverage states are part of the product.

## 8. Three-day execution and honest presentation backup

Day 1 priority: API adapters, actual live/recent/upcoming dashboard, match routing, live refresh, core scorecards and logos/fallbacks. Establish the complete critical demo path before styling optional pages.
Day 2: commentary, squads, series/standings, team/match-player pages, filters/search/favorites, responsive polish and accessibility.
Day 3: end-to-end tests, deployment checks, bug fixing, rehearsal and backup. Avoid major new backend reverse engineering on the final day.

Create an explicit **Recorded demo** mode using permitted genuine responses saved shortly before presentation, with capture time and source. Never silently switch to demo or show a green live indicator on recordings. Treat captured data as stale by design. Keep a complete historical match available for demonstration if no live match is scheduled. Demo mode is a secondary safety net, not a replacement for the real API.

Use small snapshots and local identity placeholders as necessary; do not commit enormous datasets or credentials. Explain how to refresh captures before class and switch back to live mode.

## 9. Required testing and acceptance criteria

Implement meaningful unit/integration/browser tests. Use Playwright or the available browser tooling if possible. Test at least:
- Lists fetch real API data, all tabs, filters, valid empty results.
- Provider-scoped routes retain league/date/query strings on direct reload.
- Search reduced shapes cannot crash team/flag rendering.
- Scorecards handle four innings, real zeroes, missing arrays and totals-only coverage.
- Commentary pagination starts at 1, discovers tail pages and preserves historical browsing; zero pageCount doesn't request page 0.
- Two sequential mock responses demonstrate visible score updates; requests don't overlap.
- Stale-data state preserves last good score and honest timestamp after 403/404/429/502/network errors; retries are bounded.
- Source fallback and CREX limited-coverage external links don't attempt to parse HTML as JSON.
- Every team renders a logo/verified flag or robust fallback; no image-error loops.
- Standings handle missing NRR/groups/no table; unknown fields are not fabricated.
- Missing dates never render 1970/Invalid Date; display-only CREX times get no guessed timezone.
- Favorites survive reload; similar provider IDs never collide.
- Desktop/mobile layouts, keyboard navigation, no horizontal page overflow (tables may scroll), no console/runtime errors.
- Proxy blocks arbitrary hosts/paths and external-link fetching; routes have sane request timeouts.
- Full build/typecheck/lint where configured; genuine browser smoke test on deployed URL if deployment is available.

Deliver:
1. Implemented website with a running accessible preview (and deployed link if available).
2. README: install/run/build/test/deploy, API base/env, attribution, limitations.
3. Feature/data-coverage matrix with verified, conditional and unsupported features.
4. API normalization and polling architecture notes readable by a student.
5. Test results distinguishing mocked behavior from real runtime verification.
6. A 5-minute school-demo walkthrough and short architecture explanation I can present.
7. Honest list of remaining gaps; do not claim any test/tool action you did not perform.

Start now by inspecting the repo and sampling the existing API, then implement. Make sensible defaults instead of asking me a long series of design questions. Prioritize a reliable, impressive educational presentation over impossible unsupported product parity.
