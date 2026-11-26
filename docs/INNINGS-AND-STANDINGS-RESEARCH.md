# Follow-up: missing innings sections and additional standings source

## Findings and evidence boundary

This branch fixes missing normalization, not a universal absence of upstream data.
The earlier school audit describes deployed baseline `8b9a988`; the changes here
are **local branch changes, not yet deployed or production-verified**.

### E1: ESPN summary contains all three missing scorecard sections

Inspected public response:
https://site.web.api.espn.com/apis/site/v2/sports/cricket/8661/summary?event=1546783&lang=en&region=in

Observed at `header.competitions[].competitors[].linescores[]`, keeping only
`isBatting === true` (the other side has zero-run fielding mirrors):

- `statistics.categories[].stats`: `extras`, `byes`, `legbyes`, `noballs`,
  `wides`, `penalties`.
- `fow[]`: `wicketNumber`, `wicketOver`, `runs`, `fowType`, `athlete`,
  `runsScored`, `ballsFaced`.
- `partnerships[]`: `wicketNumber`, `fowType`, `overs`, `runs`, `runRate`,
  `start`, `end`, `batsmen[].athlete/runs/balls`.

Mumbai innings sample: extras 7 = b1 + lb2 + nb1 + w3, penalties 0.
First partnership: 66, 4.4 overs, Tamore 39 (14), Raghuvanshi 26 (15).
First wicket: 66 at 4.4, Hardik Tamore. Uttarakhand FOW begins 1 at 1.1,
Rahul Namala. These are provider observations, not sums reconstructed from an
incomplete commentary page. Upstream per-over wicket commentary contained
inconsistencies around the last over; the adapter uses structured `fow` and
partnership fields as supplied, not a mixture of conflicting representations.

Root cause: `getEspnRosters(..., statistics=true)` formerly returned only rosters,
so innings-level structured fields were dropped. The scorecard now retains them.
Missing sections are `null`; a supplied empty array remains `[]`; absent
numerical fields remain `null`, distinct from zero. Values may still vary in
coverage by match. Existing `coverage` describes player-stat coverage, not a
promise every extended section exists. Sections can survive missing rosters.

### E2: standings were available, but normalization could improve

Confirmed another public table, beyond previously verified ILT20:
https://site.api.espn.com/apis/v2/sports/cricket/8661/standings

Observed named groups, team logos and numeric/display statistics. The code now
supports root-level as well as recursively nested group standings, group seasons,
team `imageUrl`, and `displayStats` (e.g. `137/20.0` instead of losing that display
value by retaining only numeric run rate). No standings are calculated from an
incomplete list of matches.

### E3: an additional provider — Sportskeeda

Public pages fetched:
- https://www.sportskeeda.com/go/syed-mushtaq-ali-trophy/points-table
- https://www.sportskeeda.com/go/ipl/points-table

Both returned readable standings tables with columns Pos, Teams, P, W, L, NR,
PTS and NRR, and team logo URLs. The SMAT response included named Groups A/B/C.
However, the IPL response mixed a 2027 title, 2026 prose and 14-played rows.
Therefore a successful table parse alone **does not establish season freshness**.

Added a source-specific, fixed-origin HTML adapter, not a guessed cross-provider
fallback:

`GET /sportskeeda/series/:slug/points-table`

Examples: `syed-mushtaq-ali-trophy`, `ipl`. Uses only the fixed public URL
`https://www.sportskeeda.com/go/{slug}/points-table`, validates slug syntax/length,
caches for 300 seconds, rejects missing/changed markup, carries provenance,
returns `season: null`, `seasonVerified: false` and a warning. Never merges ESPN
and Sportskeeda IDs, ranks, groups or seasons. Fixture mode refuses live requests.
HTML parser contract tests use **synthetic semantic HTML**, not a claimed raw HTML
recording. Public page content was observed through the external fetch tool;
the new adapter has NOT yet been exercised against real deployed Sportskeeda
HTML. Treat it as experimental pending a deployment-side live smoke test.

### Additional bounded probes (not integrations)

- https://www.sportstiger.com/live-cricket-score — external fetch failed; no exact
  HTTP status observed. Does not establish all Sportstiger endpoints are down.
- https://www.crictracker.com/syed-mushtaq-ali-trophy/points-table/ — fetch failed;
  no exact HTTP status observed.
- https://www.fancode.com/cricket/tour/syed-mushtaq-ali-trophy-2026/points-table —
  returned “Content you're looking for is not available.” This guessed route is
  NOT a discovered API and NOT evidence that FanCode has no standings feed.

Do not list these as working fallback providers. A real browser network capture
would be a sensible next step for discovering their actual current API origins.

## REA skill status

The repository's `.gitignore` referred to a local-only skill from `morluto/rea`,
but the installed folder was absent in this restored workspace. Restored and
read its `reverse-engineer-anything/SKILL.md` and connection guide from that GitHub
repository under ignored `.agents/`. Instructions are not an engine connection:
no REA MCP tools or existing `rea` executable were available in this session.
No claim of REA runtime capture, retained Evidence IDs or browser inspection is
made. Research here used external page fetches; source changes and tests used
ordinary repository tools, as the skill recommends for source-repository work.

## New response contract (after deployment)

The existing ESPN scorecard URL remains unchanged:

`/espn/match/1546783/scorecard?league=8661&date=20261126`

Each `result.innings[]` additionally has:

```ts
extras: null | {
  total: number|null, byes: number|null, legByes: number|null,
  noBalls: number|null, wides: number|null, penalties: number|null
};
fallOfWickets: null | Array<{
  wicketNumber: number|null, overs: string, runs: number|null, type: string,
  batsman: { id: string, name: string },
  batsmanRuns: number|null, ballsFaced: number|null
}>;
partnerships: null | Array<{
  wicketNumber: number|null, type: string, runs: number|null,
  overs: string, runRate: number|null,
  start: null | { overs: string, runs: number|null, wickets: number|null },
  end: null | { overs: string, runs: number|null, wickets: number|null },
  batsmen: Array<{ id: string, name: string, runs: number|null, balls: number|null }>
}>;
```

Overs stay cricket notation. No automatic decimal arithmetic or inferred active
partnership state is supplied. UI must inspect the actual fields rather than
assume every match supports them.

## Validation

- `npm ci`: successful, 0 vulnerabilities reported.
- `npm test`: **42/42 passing**, including existing regression tests.
- New/revised tests cover the three innings sections, fielding mirrors, four
  innings, null/zero/empty differences, grouped/root standings and display values,
  source-specific Sportskeeda parsing and cache/provenance through HTTP routing.
- Production-mode HTTP tests use mocked upstream transport; they are NOT live
  upstream/deployment checks. No new dependency was required.
- `git diff --check`: clean.

## Remaining release checklist

1. Deploy this branch or open/merge an approved PR.
2. Inspect the deployed example scorecard: extras/FOW/partnership values should
   match the raw provider; test a genuinely current match too.
3. Live-probe new Sportskeeda route; compare its rendered rows, groups and season
   manually with the public source. Do not promise it as current-season fallback
   while `seasonVerified` is false.
4. Re-run endpoint audit, then build website against observed response fields.
