# Paste this into the Arena.ai session building Tabish955/Cricscore

Act as a senior full-stack developer. Continue working on my existing website in **https://github.com/Tabish955/Cricscore**. Inspect its current architecture and improve the existing implementation; do not rebuild it from scratch or overwrite unrelated work.

Our CricketAPI backend has new branch changes for extras, fall of wickets, partnerships and improved standings, plus an experimental additional standings provider. Integrate these into the actual website with tests and polished responsive UI. This is an educational school presentation; commercial use is prohibited. Keep news excluded.

## 1. First check what is actually deployed

Upstream API base:

```text
https://cricketapi-beryl.vercel.app
```

There is **no `/api` prefix** on this upstream base, and no API key is needed.

**Release caveat:** when this handoff was written, the new backend code existed on `Tabish955/CricketAPI` branch `arena/c2d2dc67-cricketapi`, but had NOT been deployed or live-smoke-tested. Do not assume the production URL already returns the new fields. Do not try to deploy or modify that backend repository from this website session unless I authorize it separately.

Before implementation:
1. Inspect the existing website API adapter, routes, scorecard/standings components and tests.
2. Fetch upstream `/` or `/index.json`, then representative scorecards and standings. The index can advertise the new Sportskeeda route only after its release, but ESPN field additions must be checked on an actual response.
3. Check both HTTP status and JSON `success`. A successful old scorecard can still lack the new fields.
4. If deployment is pending, implement backward-compatible support and test with **explicitly labeled synthetic contract fixtures**. Keep the live website functional using existing data. Report “website support implemented; backend release pending”, not “verified live”. Never silently insert test data into live screens.
5. Historical example IDs below are integration examples, NOT a substitute for discovering current matches. If an example no longer resolves, choose a returned current/recent match and preserve its links/IDs.

## 2. Extended ESPN scorecard: same endpoint, new innings fields

```http
GET /espn/match/:matchId/scorecard?league=:leagueId&date=YYYYMMDD
```

Historical sample:

```text
https://cricketapi-beryl.vercel.app/espn/match/1546783/scorecard?league=8661&date=20261126
```

`league` is required. `date` selects the league scoreboard date and is important for historical matches. IDs are provider-specific: ESPN match IDs must NEVER be put into `/cb/match/:id`, and ESPN league IDs must not be replaced with Cricinfo or Cricbuzz series IDs.

Prefer the API-returned `scorecard` URL from a match card/detail. Preserve its query string. If constructing the ESPN URL, use the actual match's ESPN league ID and UTC scoreboard date, not hardcoded example IDs or the browser's local day.

Response envelope:

```ts
{
  success: true,
  result: {
    matchId: string,
    innings: Innings[],
    coverage: string,
    warnings?: string[]
  },
  meta: {
    dataMode: string,
    source: {
      source: 'live' | 'fixture',
      upstream?: string,
      fetchedAt?: string,
      cached: boolean,
      playerStatistics?: {
        source: 'live' | 'fixture',
        upstream?: string,
        fetchedAt?: string,
        cached: boolean
      }
    }
  }
}
```

Existing `innings[]` totals, `batsmen[]` and `bowlers[]` remain. New fields are **inside each innings**, NOT under `result.scorecard` or at the response root:

```ts
type NullableNumber = number | null;
type InningsEndpoint = {
  overs: string;
  runs: NullableNumber;
  wickets: NullableNumber;
};

type ExtendedInnings = {
  inningsId: number;
  teamId?: string;
  team: string;
  score: string;
  overs: string;
  declared?: boolean;
  // Existing batsmen/bowlers arrays remain; preserve their existing contracts.

  // Optional permits old deployed versions. Null means unavailable.
  extras?: null | {
    total: NullableNumber;
    byes: NullableNumber;
    legByes: NullableNumber;
    noBalls: NullableNumber;
    wides: NullableNumber;
    penalties: NullableNumber;
  };

  fallOfWickets?: null | Array<{
    wicketNumber: NullableNumber;
    overs: string;
    runs: NullableNumber; // TEAM score at dismissal, not batter runs
    type: string;
    batsman: { id: string; name: string };
    batsmanRuns: NullableNumber;
    ballsFaced: NullableNumber;
  }>;

  partnerships?: null | Array<{
    wicketNumber: NullableNumber;
    type: string; // Provider fowType; don't assume an undocumented enum.
    runs: NullableNumber; // Partnership total, including relevant extras.
    overs: string;
    runRate: NullableNumber;
    start: InningsEndpoint | null;
    end: InningsEndpoint | null;
    batsmen: Array<{
      id: string;
      name: string;
      runs: NullableNumber; // This batter's contribution to this partnership.
      balls: NullableNumber;
    }>;
  }>;
};
```

These are structured upstream values, not guessed values from incomplete commentary. The existing `coverage` text describes player-stat coverage; it does NOT guarantee that each extended section is present. Inspect each field independently.

### Required scorecard UI

- **Extras:** add a compact row beneath each innings batting table: total and available b/lb/w/nb/pen breakdown. Use `??`, not truthiness: 0 is a real value. Missing/null values must display as unavailable, not zero. Do not recompute an authoritative total from a partial breakdown or from bowling concessions.
- **Fall of wickets:** score-over chips or a compact table with wicket number, team score, dismissed player and over. Preserve provider order and dismissal type. Do not assume every FOW row is a conventional dismissal or that ten wickets always exist.
- **Partnerships:** show both batter names, their contribution runs/balls when supplied, partnership total, overs and supplied rate. Optional contribution bars must not imply batter contributions include extras. Batter contributions need not sum to the partnership total. Don't infer “currently batting” from a final row unless separately established.
- Support all returned innings, including four-innings Tests. Key state by provider + match ID + innings ID, not team alone.
- Missing/undefined/null section: show a discreet “Not supplied for this match” state or omit just that section. An explicitly supplied empty `[]` is different from unavailable: render an appropriate empty state, not an outage.
- No fake extras, FOW or partnerships, and no reconstruction from one commentary page.
- Overs are cricket notation, not decimal arithmetic. Preserve strings; do not calculate 4.4 overs as 4.4 numeric overs.
- Keep layouts mobile-friendly and accessible; avoid broad page overflow.

Observed upstream historical sample for sanity checks only: Mumbai extras 7 (b1, lb2, nb1, w3, pen0); first wicket 66 at 4.4, Hardik Tamore; first partnership 66 with Tamore 39 (14) and Raghuvanshi 26 (15). Do not hardcode these into the live website or expect historical provider data never to be corrected.

## 3. Improved ESPN standings: existing endpoint

```http
GET /espn/standings/:leagueId
```

Examples:

```text
https://cricketapi-beryl.vercel.app/espn/standings/8661
https://cricketapi-beryl.vercel.app/espn/standings/20921
```

Do not assume these examples establish universal league coverage or a guaranteed current season.

After the backend update, the contract is:

```ts
{
  success: true,
  result: {
    leagueId: string,
    name: string,
    season: unknown | null,
    groups: Array<{
      id: string,
      name: string,
      season: number | null,
      entries: Array<{
        team: {
          id: string,
          name: string,
          short: string,
          imageUrl: string
        },
        stats: Record<string, unknown>,
        displayStats: Record<string, string>
      }>
    }>
  },
  meta: { dataMode: string, source: unknown }
}
```

Old responses may omit `name`, group `id`/`season`, `team.imageUrl` or `displayStats`. Be backward-compatible. ESPN season values may be objects; don't render `[object Object]`. Use validated year/date fields and preserve group season context without guessing.

Common numeric stat keys:

```text
rank, matchesPlayed, matchesWon, matchesLost,
noresult, matchesTied, matchesDraw, matchPoints, netrr
```

- Render groups and provider ranks as returned; don't globally sort unrelated groups.
- Do not generate official standings from a partial results list.
- Preserve signs/formatting with `displayStats[key]` when present; use numeric `stats[key]` for safe sorting/calculations only when genuinely numeric.
- Especially use `displayStats.for` and `displayStats.against` if showing them: numeric values may be run rates, while display strings contain runs/overs (e.g. `137/20.0`).
- Zero is valid; null/absent is unknown. Never fabricate NRR or points.
- A valid empty groups/entries result can mean no league table is applicable, especially a bilateral series. Don't call it an API outage or endlessly refetch.
- Use supplied team imageUrl with the shared team identity component; older payloads can resolve logos from the existing ESPN provider+team-ID registry.

## 4. NEW experimental Sportskeeda standings endpoint

```http
GET /sportskeeda/series/:slug/points-table
```

Example after backend release:

```text
https://cricketapi-beryl.vercel.app/sportskeeda/series/syed-mushtaq-ali-trophy/points-table
```

This is an independent source-specific HTML adapter. It is not a new universal `/standings` endpoint, not a replacement for every failed ESPN league, and not an automatic cross-provider ID mapping service.

Slug must be a lowercase alphanumeric/hyphen identifier, maximum 100 characters, such as `syed-mushtaq-ali-trophy` or `ipl`. Only use verified explicit source mappings. Never convert a numeric ESPN league ID into a Sportskeeda slug by guesswork, pass a full URL as the slug, or accept arbitrary upstream hosts.

Response:

```ts
{
  success: true,
  result: {
    provider: 'sportskeeda',
    seriesSlug: string,
    title: string,
    season: null,
    seasonVerified: false,
    warnings: string[],
    groups: Array<{
      name: string,
      entries: Array<{
        team: {
          id: string, // Sportskeeda slug; can be empty if source has no identity link.
          name: string,
          short: string, // May be empty.
          imageUrl: string // May be empty.
        },
        stats: {
          rank?: number | null,
          matchesPlayed?: number | null,
          matchesWon?: number | null,
          matchesLost?: number | null,
          noresult?: number | null,
          matchPoints?: number | null,
          netrr?: number | null,
          matchesTied?: number | null,
          matchesDraw?: number | null
        }
      }>
    }>
  },
  meta: {
    dataMode: string,
    source: {
      source: 'live',
      upstream: string,
      fetchedAt: string,
      cached: boolean
    }
  }
}
```

### Critical season warning

Research found conflicting season labels on a Sportskeeda IPL page. Therefore this adapter **always returns `seasonVerified: false`** in its current implementation. `meta.source.source === 'live'` means the page was fetched live, NOT that its table is verified as the current tournament season.

For the website:
- Keep verified ESPN standings as the primary critical presentation path.
- Add Sportskeeda as an explicit secondary-source choice only for a verified slug mapping and supported deployed route.
- Prominently show “Sportskeeda · Season not verified” and the warning. Do not call it a verified current-season table, even when the title contains a year.
- Never silently merge ranks, NRR, team IDs, group rows or seasons across providers.
- If no verified mapping exists, show “Additional source not configured”, not an invented table.
- A 404/502/network error or missing markup must degrade only that source, not blank the whole series page.
- Do not keep retrying the endpoint if root index/deployment checks show it is not released yet.
- The backend refuses live Sportskeeda calls in fixture mode because no recorded fixture is installed. Respect that; don't treat it as valid empty standings.
- Treat this source as experimental until a real deployed adapter request succeeds and its rows/groups are checked against the public page. Synthetic HTML parser tests are not proof the deployed source works.

## 5. Shared integration and refresh rules

- Reuse the existing same-origin website API adapter; if needed, add allowlisted routes for the above path patterns and safe query keys. The website may use its own `/api/cricket/...` path, but its UPSTREAM remains the exact base above without `/api`.
- Fixed upstream origin only; reject arbitrary URLs/hosts, unexpected path segments and unsafe query strings. Don't create an open proxy.
- Validate API-returned links against the expected API origin before proxying. External source links should be external links, not parsed as API JSON.
- Avoid a framework/CDN caching layer freezing live scorecards. Use explicit no-store or correctly controlled revalidation rather than stacking long caches.
- Query/cache keys include provider, match/league/slug, date and relevant pagination.
- Poll a visible active LIVE match scorecard about every **10 seconds**; the backend summary stats have a roughly 10-second cache. Completed matches need no rapid polling.
- Poll standings at most about every **5 minutes** while visible; backend standings caches are 300 seconds. Do not run standings requests on each score tick.
- Pause hidden-tab/offline polling, dedupe requests, cancel on navigation, back off with jitter on failure, and avoid overlapping requests.
- Preserve last good data after transient failure with an honest stale badge. Keep last successful fetch time distinct from latest attempt and upstream fetchedAt; an API error must not reset freshness.
- No claim of instantaneous score synchronization or push updates.
- Render one TeamIdentity component everywhere: source image → exact provider+team-ID registry → clearly nonofficial abbreviation fallback. Never guess a national flag for a franchise/state team.
- Important: the current CricketAPI `/img` proxy does **not** allow `a.espncdn.com`. Display valid supplied image URLs directly with a normal image element or correctly configured framework image component, fixed dimensions, alt text and one-shot error fallback. Don't send ESPN logos through that proxy.
- For empty team IDs, use a source/series/group/row-scoped UI key; do not store all unidentified teams under one global empty-ID favorite or asset key.
- Render upstream strings as text, not unsafe HTML.

## 6. Required tests

Add tests in the project's existing test stack, using clearly labeled mocks where necessary:

1. Old scorecard without new fields still renders.
2. Extras real zero vs absent/null values; incomplete breakdown is not summed into a fake total.
3. Four innings remain separate, even with the same team batting twice.
4. FOW team score differs from batter runs and both render correctly.
5. Partnership batter contributions need not sum to total because of extras.
6. `null`, undefined and `[]` section states behave correctly.
7. ESPN grouped standings, empty/no-table response, missing logos, group seasons, displayStats and zero points.
8. Sportskeeda route absent pre-release; source error; season warning always visible when false; no cross-provider ID collision or silent merging.
9. Successful scorecard re-fetch updates these sections without resetting innings selection or page scroll.
10. Polling doesn't overlap; standings aren't requested every 10 seconds; hidden tabs pause.
11. Browser smoke tests at mobile and desktop widths, image failures, nested-route reload, no runtime/console errors.
12. Run build/typecheck/lint/tests as configured and report actual commands/results.

## 7. Deliver this update, not just advice

Implement the website changes in Cricscore now. Preserve its design language while making the new sections clear and responsive. Keep the educational-only disclaimer and source attribution. Do not add news or unsupported player/career data while doing this task.

Finish with:
- What changed and the pages/components affected.
- Which API version/capabilities were actually observed at runtime.
- A clear separation of live verification vs mocked contract tests.
- Any backend deployment blocker and exactly which features await release.
- Running Arena preview and a short walkthrough of where to see Extras, FOW, Partnerships and Standings.

Do not claim backend deployment, universal source coverage, season freshness or successful live testing without evidence. Start by inspecting this repository and checking the deployed API capabilities, then code the update.
