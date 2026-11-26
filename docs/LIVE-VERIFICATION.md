# Runtime verification of current-score providers

Observed response timestamps: 2026-11-26T07:01Z onward. Research was performed
using external page-fetch tooling because the local sandbox only permits a
limited set of package/GitHub hosts. Counts and scores below are point-in-time
observations, not promises about future matches or upstream availability.

## Production (merged PR #3)

Base: https://cricketapi-beryl.vercel.app

- `/cb/live`: 10 current matches, ESPN IDs and provider-correct links. This is
  the actual live fallback, not a locally mocked test.
- `/espn/recent`: 3 results; Uttarakhand–Mumbai (1546783), Mumbai won by 86 runs.
  Metadata source `live`, fetchedAt `2026-11-26T07:01:04.718Z`.
- `/espn/upcoming`: 18 scheduled matches in the rolling header window.
- `/espn/match/1546783?league=8661&date=20261126`: Mumbai 209/10, Uttarakhand
  123/10; venue in Kolkata; Musheer Khan player of the match; source `live`.
- `/espn/standings/20921`: six teams, 2026 season. Dubai Capitals now rank 4,
  two played and two points; the recording has them rank 6 with one played.
  This differing table helps demonstrate the response is not the old fixture.
- `/espn/match/1546783/squads?league=8661`: summary rosters contained real
  per-innings player statistics, establishing the source for PR #4 scorecards.

## Expanded implementation preview (PR #4)

Base: https://cricketapi-git-arena-f35067-ahmedtabish1000-gmailcoms-projects.vercel.app

- `/espn/match/1546783/scorecard?league=8661&date=20261126`: two innings;
  11 Mumbai batters including Musheer Khan 65 off 40; Uttarakhand bowling
  includes Jagadeesha Suchith 3/28. Both scoreboard and player-stat metadata
  report live upstream fetches.
- `/espn/match/1546783/commentary?league=8661&page=2`: upstream pageIndex 2,
  pageSize 25, pageCount 10, total 227; begins Shah to Raghuvanshi, FOUR (4.1).
  Direct upstream comparison exposed `innings.totalRuns` as delivery runs,
  not the cumulative score. Mapping corrected to `innings.runs` with regression
  coverage; final deployment must be rechecked for cumulative score 65/0.
- `/crex/live?verify=2872654`: 9 matches. Sydney Thunder Women 240/4 and Adelaide
  Strikers Women 111/2 at 11.2 overs in this snapshot.
- `/crex/recent?verify=2872654`: 2 results (Mumbai and Karnataka wins).
- `/crex/upcoming`: 9 scheduled matches, including Chandigarh–Jharkhand.
- `/sources/status?verify=2872654`: ESPN available (10 live), CREX available
  (20 schedule entries); each metadata source `live`.

Verification query parameters avoid stale research-tool response caches; they
are not API authentication and are ignored by the route logic.

## Independent-source investigation

- CREX schedule at https://crex.com/schedule: reachable from Vercel; actual markup
  uses anchor `.match-card-wrapper` with `.team-info`, `.team-name`,
  `.team-score`, `.total-overs`, and `.result > span`. Third-party wrapper-tag
  assumptions were disproved by runtime structural diagnostics and corrected.
- FanCode at https://www.fancode.com/cricket and public match info: reachable
  through research tools, exposes match metadata and standings. No score-feed
  integration is claimed; video subscription/access controls are not bypassed.
- SofaScore cricket live API on both www and api hosts: failed research probes.
  Not added as a purported working provider.
- Sportskeeda cricket page: reachable through research tools. Not integrated;
  a second HTML parser without deployment evidence would not improve certainty.

## Limits (do not call every endpoint fully working)

- Cricbuzz modern JSON and hs-consumer Cricinfo availability remain unreliable;
  the provider chain exists precisely because of these failures.
- Original Cricbuzz player search/profile, legacy mobile APIs and Cricbuzz-only
  series routes have not been proven healthy by this verification.
- Header and CREX lists are current windows, not an exhaustive calendar.
- CREX statuses can lag ESPN and timestamps are display-only; unknown dates
  remain null and timezone conversion is not guessed. Results are not merged
  across sources or linked by guessed IDs. CREX detail links point upstream.
- Commentary pagination follows upstream ordering; page 1 is not guaranteed
  to mean the latest delivery. A match can have no commentary or detailed stats.
- If all live sources fail, return an error, never an old fixture. Recordings
  exist only for explicit offline mode and reproducible regression tests.
