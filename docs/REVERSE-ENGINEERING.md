# Reverse-engineering notes — CricketAPI

Methodology: the REA ("reverse-engineer-anything") skill's diagnose-and-continue
workflow. Live capture of `cricbuzz.com` / `espncricinfo.com` was **impossible from
this sandbox** (all target hosts blocked: `curl` returned `000`, `fetch_page` returned
HTTP 500 / page errors). Therefore the endpoint map and response shapes were
reconstructed from **public open-source code and recorded fixtures**, and every
claim below is either (a) fixture-verified in `fixtures/` or (b) code-observed in a
named public repository. Nothing was guessed.

Legend: **[F]** = fixture-verified in this repo · **[C]** = code-observed (public repo) · **[U]** = unverified (implemented from [C], no capture).

---

## 1. Upstream endpoint inventory

### 1.1 Cricbuzz modern web-app JSON API — `https://www.cricbuzz.com/api/…` **[C]**

All requests need browser-like headers: `User-Agent`, `Accept: application/json`,
`Referer: https://www.cricbuzz.com/`, `x-cricbuzz-client: ui`.

| Endpoint | Used for | Status here |
| --- | --- | --- |
| `/api/cricket-match/live` | live list | **[F]** `fixtures/cricbuzz-live.json` |
| `/api/cricket-match/recent` | recent list | **[F]** `fixtures/cricbuzz-recent.json` (flattened capture) |
| `/api/cricket-match/upcoming` | upcoming list | **[F]** `fixtures/cricbuzz-upcoming.json` |
| `/api/cricket-match/{id}/match-info` | detail header | **[C]** |
| `/api/cricket-match/{id}/live-score` | miniscore (batters/bowler/CRR) | shape **[F]** via `fixtures/cricbuzz-live-score.json` |
| `/api/cricket-match/{id}/scorecard` | full scorecard | **[F]** `fixtures/cricbuzz-scorecard.json` (match 53373) |
| `/api/cricket-match/{id}/commentary/{page}` | modern commentary | **[F]** `fixtures/cricbuzz-commentary.json` (match 152097) |
| `/api/cricket-match/{id}/squads` | squads | **[C]** |
| `/api/cricket-search/v2?action=cricketers&q=…&callback=` | player search (JSONP) | **[C]** — returns `player[]{id,name,teamName,role}`; **not fixture-verified** |
| `/api/cricket-series/{sid}/matches` | series fixtures | **[C]** |
| `/api/series/{sid}/points-table` | points table | **[C]** |
| `/match-api/{id}/commentary.json` | commentary fallback | **[C]** |

Observed in `Nayan0509/Livecricket1` (`cricket-live/api/scraper.js`,
`server/routes/players.js`) and `tarun7r/cricket-mcp-server`.

Known dead ends (do not retry):
- `/api/search/results`, `/search`, `/api/html/search` → 404/empty (observed in
  `tm-droid/bouncer` player search code).
- HTML fallbacks (`/live-cricket-scores/{id}`, `/profiles/{id}`,
  `/cricket-schedule/...`, `/cricket-news`, `/cricket-stats/icc-rankings/...`) exist
  but are brittle; `/profiles/{id}` is used only as a last-resort player-profile
  source with a label scanner (`born`, `birthPlace`, `height`, `role`,
  `battingStyle`, `bowlingStyle`).

### 1.2 Cricbuzz legacy mobile API — `mapps.cricbuzz.com/cbzios/…` **[F]**

Plain GET, no `x-cricbuzz-client` required (but sent anyway).

| Endpoint | Fixture |
| --- | --- |
| `/cbzios/match/livematches` | `fixtures/cbzios-livematches.json` (12 matches) |
| `/cbzios/match/{id}` (summary: header/venue/toss/officials/players/squads) | `fixtures/cbzios-match-summary.json` (match 20717, Headingley 2019 Ashes) |
| `/cbzios/match/{id}/commentary` | `fixtures/cbzios-commentary.json` (match 20717, `comm_lines` with HTML) |
| `/cbzios/match/{id}/scorecard` | `fixtures/cbzios-scorecard.json` (rain-interrupted SLW innings) |
| `/cbzios/series/{id}`, `/series/{id}/{matches,teams,venues}`, `/pointtable/{sid}` | **[C]** (`pycricbuzz`, `CricNode-Django-Website`) — not fixture-verified |

Transport note: https first, http fallback (the host historically served both;
both are attempted in `src/providers.js`).

### 1.3 ESPNcricinfo — `hs-consumer-api.espncricinfo.com/v1/pages/…` **[F]/[C]**

| Endpoint | Status |
| --- | --- |
| `/matches/current?lang=en&latest=true` | **[F]** `fixtures/cricinfo-current.json` |
| `/matches/live?lang=en` | **[C]** |
| `/matches/{scheduled,result}?lang=en&filterType=DATE&filterValue=DD-MM-YYYY` | **[C]** |
| `/match/{home,details,scorecard}?lang=en&seriesId={sid}&matchId={mid}` (+`&latest=true`) | **[C]** — `seriesId` is required by the upstream |
| `/series/{home,standings,schedule}?lang=en&seriesId={sid}` | **[C]** (`DaftVino/torn-bookie-live-scores` provider notes) |
| legacy `espncricinfo.com/matches/engine/match/{id}.json` | **[C]** |
| ESPN site API `site.api.espn.com/apis/site/v2/sports/cricket/22641/summary` | **[C]** |
| images `https://img1.hscicdn.com/image/upload/f_auto,t_ds_square_w_160,q_50/lsci{path}` | **[C]** — allowlisted in `/img` |

Caveat (observed in `DaftVino/torn-bookie-live-scores`): multi-innings score
strings look like `158`, `162/2`, `358 & 76/2` — keep them as opaque strings.

### 1.4 RapidAPI mirrors — **not used**

`cricbuzz-cricket.p.rapidapi.com` (`/matches/v1/live`, `/mcenter/v1/{id}/scard`,
`/schedule/v1/international`) and `api.cricapi.com/v1` require paid/registered
keys — unusable for this build. Recorded only as reference for path shapes.

---

## 2. Response shapes (fixture-verified)

### 2.1 Modern match list (`typeMatches`) **[F]**

```
{ typeMatches: [ { matchType, seriesMatches: [ { seriesAdWrapper:
    { seriesId, seriesName, matches: [ { matchInfo, matchScore } ] } } ] } ] }
```
- `matchInfo`: `matchId`, `seriesId/Name`, `matchDesc`, `matchFormat`,
  `startDate`/`endDate` (epoch **ms**), `state`, `stateTitle`, `status`,
  `team1/team2{teamId,teamName,teamSName,imageId}`, `venueInfo{ground,city,country}`.
- States seen in fixtures: `In Progress`, `Stumps`, `Toss`, `Delay`, `Complete`,
  `Preview`, `mom`.
- `matchScore.teamXScore.inngs1 = {inningsId,runs,wickets,overs,isDeclared}`.
- **Flattened variant**: `fixtures/cricbuzz-recent.json` is a pandas-style
  row-per-match capture with dotted keys (`typeMatches.seriesMatches.…`) —
  `normalizeTypeMatches` unflattens it automatically (`unflattenDotted`).

### 2.2 Modern scorecard **[F]** (match 53373, Womens Ashes Only Test)

```
{ scoreCard: [ { batTeamDetails{batsmenData{bat_N}}, bowlTeamDetails{bowlersData},
    scoreDetails{runs,wickets,overs,runRate,isDeclared}, extrasData,
    partnershipsData, wicketsData } ],
  matchHeader{matchId,matchFormat,matchDescription,seriesName,tossResults,
    team1/team2{name,shortName},state,status,matchStartTimestamp},
  isMatchComplete, status }
```

### 2.3 Modern live-score / miniscore **[F]**

```
{ commentaryList, miniscore{ batsmanStriker/NonStriker, bowlerStriker/NonStriker,
  batTeam, currentRunRate, requiredRunRate, remRunsToWin, remBallsToWin,
  recentOvsStats, partnership, matchScoreDetails{inningsScoreList} } }
```

### 2.4 Modern commentary **[F]** (match 152097)

```
{ matchId, commentary: [ { inningsId, commentaryList: [ { commText, timestamp,
    ballNbr, event, legalRuns, totalRuns, batsmanStriker, bowlerStriker,
    batTeamScore, commentaryFormats } ] } ], commentarySnippetList, matchDetails }
```
No `overNumber` field observed — ball number comes from `ballNbr`.

### 2.5 cbzios livematches **[F]**

```
{ matches: [ { match_id, series_id, series_name, header{state,status,match_desc,
  type,state_title,start_time,end_time,momNames}, team1/team2{id,name,s_name},
  bat_team/bow_team{id,innings[{id,score,wkts,overs,decl}]},
  batsman[{id,name,r,b,4s,6s,strike}], bowler[{id,name,o,m,r,w}] } ] }
```
`start_time`/`end_time` are epoch **seconds** (×1000 in the normalizer).

### 2.6 cbzios match summary **[F]** (match 20717)

```
{ match_id, series_id, series_name, header{state,status,match_desc,type,
  state_title,toss,momNames,…}, venue{name,location,timezone,lat,long},
  official{umpire1/2/3,referee{name,country}}, toss{winner,decision},
  team1/team2{id,name,s_name,flag,squad[int], squad_bench[int]},
  players: [ {id:str, f_name, name, bat_style, bowl_style, speciality, image} ] }
```
Squad arrays are **ints**, player index ids are **strings** — normalizer coerces.

### 2.7 cbzios commentary **[F]** (match 20717)

```
{ match_id, comm_lines: [ { comm (HTML!), timestamp, o_no, score, wkts, evt,
  runs, bat_s_name, bat_s_balls, bat_s_runs, bat_ns_*, bowl_name, bowl_overs,
  bowl_runs, bowl_wickets, o_summary, i_id, … } ],
  over_summary, crr, target, last_wkt, header, venue }
```
`comm` contains HTML (`<b>…</b>`) — always stripped by `stripHtml`.

### 2.8 cbzios scorecard **[F]**

```
{ scorecard: [ { inningsid, batteamname, batteamsname, score, wickets, overs,
  runrate, isdeclared, extras{byes,legbyes,wides,noballs,penalty,total},
  batsman[{id,name,balls,runs,fours,sixes,strkrate,outdec,iscaptain,iskeeper}],
  bowler[{id,name,overs,maidens,runs,wickets,economy,…}],
  fow{fow:[…]}, partnership{partnership:[…]} } ],
  ismatchcomplete, status }
```

### 2.9 ESPNcricinfo current list **[F]**

```
{ matches: [ { id, slug, stage, state, title, startDate, endDate, status,
  statusText, series{id,name,longName,…}, ground{id,name,smallName,longName},
  teams: [ { team{id,name,abbreviation,imageUrl}, score, scoreInfo } ],
  winnerTeamId, liveInning, liveOvers, … } ], objects }
```
Fixture capture is a **single finished match** (115589, PAK v BAN 2nd Test 2024).

---

## 3. Fixture provenance

All files in `fixtures/` were downloaded from public GitHub repositories via the
GitHub API (`contents` endpoint, base64) because raw/CDN access was blocked:

| Fixture | Source repository / file |
| --- | --- |
| `cricbuzz-live.json` | `Nihaa-20/Cricbuzz_API` → `matches_live.json` |
| `cricbuzz-recent.json` | `Nihaa-20/Cricbuzz_API` → `matches_recent.json` (flattened) |
| `cricbuzz-upcoming.json` | `Nihaa-20/Cricbuzz_API` → `matches_upcoming.json` (Preview states) |
| `cricbuzz-scorecard.json` | `Nihaa-20/Cricbuzz_API` → `matches_scorecard.json` (match 53373) |
| `cricbuzz-live-score.json` | `Nihaa-20/Cricbuzz_API` → live-score capture (match 153780) |
| `cricbuzz-commentary.json` | `ByteLounge` → `comm_data.json` (match 152097) |
| `cbzios-livematches.json` | `Santos-Enoque/flutter-hair-saloon-app` → `assets/cricket_data/livematches.json` |
| `cbzios-match-summary.json` | `Santos-Enoque/…` → `assets/cricket_data/Summary.json` (match 20717) |
| `cbzios-commentary.json` | `Santos-Enoque/…` → `CommentaryInProgress.json` (match 20717) |
| `cbzios-scorecard.json` | `Perarivalan-Ganapathi/Cricbuzz-LivStats` → `jsons/partnership/135096_odi.json` |
| `cricinfo-current.json` | `Dennis-Rosenbaum/MMM-Cricket-Scores` → `Documentation/Example_match_result.json` |

Key code references (not vendored): `Nayan0509/Livecricket1`
(`cricket-live/api/scraper.js` — endpoint list, `apiHeaders`, HTML/RSC fallbacks,
`parseMiniscore`, `mapInningsData`), `codophobia/pycricbuzz` (cbzios routes),
`tarun7r/cricket-mcp-server` (commentary + HTML paths),
`DaftVino/torn-bookie-live-scores/docs/PROVIDER_NOTES.md` (ESPN endpoints),
`tm-droid/bouncer` (dead Cricbuzz search endpoints).

## 4. Gaps / unverified surfaces

Implemented from code observation but **without a recorded capture** — expect
possible drift:

- Player search (`cricket-search/v2` JSONP) and `/profiles/{id}` HTML scraping.
- Series matches / points table routes.
- ESPNcricinfo list variants other than `current`, and match details.
- Modern `/squads` endpoint (fixture mode serves the legacy summary instead).

In `DATA_MODE=fixtures` these answer `404 NO_FIXTURE` rather than fabricating
payloads; in `auto`/`live` they are attempted live.

## 5. Blocked paths (do not retry)

- Direct fetch of `cricbuzz.com`, `mapps.cricbuzz.com`, `espncricinfo.com`,
  `hs-consumer-api.espncricinfo.com` from this sandbox: connection blocked
  (`SSL_ERROR_SYSCALL` / HTTP 500 / empty). Verification is via fixtures only.
- `raw.githubusercontent.com` returns empty bodies — use `api.github.com` contents.
- RapidAPI cricket proxies: key-gated.
