# CricketAPI contracts and operational guidance (candidate branch)

Base: `https://cricketapi-beryl.vercel.app`. No API key or `/api` prefix.
This document describes the candidate changes plus existing implementation;
it is not evidence those changes have been released. See ASSET-INCIDENT.md.

## Compatibility and missing values

No client route migration. New nullable `flagUrl` and `scores[].teamId` are
additive. Explicitly requested asset correction: team `imageUrl` is now
`string | null` instead of string/empty/absent, including confirmed dead references.
This is a type widening consumers must tolerate before rollout; it is not
honest to call string-only consumers unaffected. Do not deploy until reviewed.

New optional/missing data uses null, never a fabricated zero. Explicitly supplied
empty arrays remain empty; null means unavailable. Legacy fields still include
empty strings, omitted arrays and false defaults; this release does NOT globally
rewrite them. A universal null convention would require a separately versioned
contract. Below `?` means legacy field may be absent; `N` = number|null.

## Envelopes and sources

- Lists: `{success:true,result:{found:boolean,count:number,matches:ListMatch[]},meta}`.
- Detail: `{success:true,result:{found:true,match:DetailMatch},meta}`.
- Scorecard: `{success:true,result:{matchId,innings:Innings[],coverage,warnings?:string[]},meta}`.
- Commentary: `{success:true,result:{matchId,page,pageSize,pageCount,total,commentary:Delivery[]},meta}`.
- Squads: `{success:true,result:{matchId,teams:Squad[]},meta}`.
- ESPN standings: `{success:true,result:{leagueId,name,season:object|null,groups:Group[]},meta}`.

`meta.dataMode` is auto/live/fixtures. Provider metadata is usually `meta.source`,
list fallback may use `meta.primary`; player stats have separate metadata under
`meta.source.playerStatistics`. A provenance object contains `source` (live or
fixture), optional `upstream`, `fetchedAt` ISO timestamp, `cached` boolean, optional
upstream errors/fixture file. Match `source` (e.g. espn-site/crex) is provider
identity, not freshness. Never interpret live source as verified season accuracy.

## Field-by-field normalized ESPN / primary list types

```ts
type N = number|null;
type Team = {
  id: string; name: string; short: string;
  imageUrl: string|null; flagUrl: null; // No verified flag mapping yet.
};
type Score = {
  team: string; teamId: string|null; score: string; overs: string;
  inningsId?: number; declared?: boolean;
};
type Venue = {ground:string; city:string; country?:string};
type ListMatch = {
  matchId:string; teams:string; team1:Team; team2:Team;
  scores:Score[]; category:string; live:boolean;
  status:string; state:string; stateTitle:string;
  series:string; seriesId:string; format:string;
  venue:Venue|null; startDate:number|null; endDate:number|null;
  source:string; detail?:string; scorecard?:string;
  commentary?:string; squads?:string; upstream?:string;
  startTimeText?:string; // CREX: display only, no inferred date/timezone.
};
type DetailMatch = {
  matchId:string; teams:string; team1:Team; team2:Team;
  series:{id:string;name:string}; scores:Score[];
  category:string; live:boolean; state:string; status:string;
  stateTitle:string; format:string; startDate:number|null; endDate:number|null;
  venue:Venue; playerOfTheMatch:string[]; source:string;
  detail?:string;scorecard?:string;commentary?:string;squads?:string;upstream:string;
};
type Batter = {
  id:string;name:string;teamId:string;position:number|null;
  runs:N;balls:N;fours:N;sixes:N;strikeRate:N;dismissal:string;isBatting:boolean;
};
type Bowler = {
  id:string;name:string;teamId:string;overs:string;
  maidens:N;runs:N;wickets:N;economy:N;wides:N;noBalls:N;
};
type Endpoint = {overs:string;runs:N;wickets:N};
type Innings = Score & {
  batsmen?:Batter[];bowlers?:Bowler[];
  extras:null|{total:N;byes:N;legByes:N;wides:N;noBalls:N;penalties:N};
  fallOfWickets:null|Array<{
    wicketNumber:N;overs:string;runs:N;type:string;
    batsman:{id:string;name:string};batsmanRuns:N;ballsFaced:N;
  }>;
  partnerships:null|Array<{
    wicketNumber:N;type:string;runs:N;overs:string;runRate:N;
    start:Endpoint|null;end:Endpoint|null;
    batsmen:Array<{id:string;name:string;runs:N;balls:N}>;
  }>;
};
type Delivery = {
  id:string;inningsId:number|null;over:number|null;ball:number|null;
  event:string;text:string;runs:N;batsman:string;bowler:string;
  score:string|null;wicket:boolean;
};
type Squad = {
  teamId:string;teamName:string;
  players:Array<{
    id:string;name:string;role:string;isCaptain:boolean;isStarter:boolean;
    battingStyle:string;bowlingStyle:string;
  }>;
};
type Group = {
  id:string;name:string;season:number|null;
  entries:Array<{
    team:Team;stats:Record<string,unknown>;displayStats:Record<string,string>;
  }>;
};
```

Numeric raw ESPN statistics can retain source types; validate numbers rather
than coercing missing values. `format` can be absent on normalized detail payloads
from older deployments. New detailed fields are not guaranteed in legacy cb
scorecards: those retain their existing provider-specific contracts. Cricinfo
current/live have an alternate shape, not the primary list schema. Search returns
a reduced match shape (matchId, teams, status, live, detail, series); not Team arrays.
Do not validate every advertised route against ESPN's schema.

### Matching scores and declarations

ESPN `scores[].teamId` comes directly from that competitor's team ID. Fallback
scores also have teamId. Shared boundary fills missing teamId only for a unique
EXACT match against that match's team1/team2 name or short fields. No fuzzy names,
country inference, aliases across providers or array-position assumptions.
Unresolved/ambiguous identity is null. Namespace identifiers by provider.

ESPN's `team` is normally the provider abbreviation. CREX uses its display name.
Do not assume one global alias vocabulary. `declared` is true when ESPN's innings
`description` includes “declared” (case insensitive); false otherwise. In older
fallback string-only scores it may be absent. Preserve the raw score display;
false/absent does not prove a provider emitted an explicit no-declaration flag.

## Commentary semantics and limits

`GET /espn/match/:id/commentary?league=ID&page=1` uses positive pages 1..9999.
Values are forwarded from upstream: pageIndex→page, pageSize→pageSize,
pageCount→pageCount, count→total. Observed sample: match 1546783, 227 plays,
25 per page, 10 pages. Page 1 is the first record page, not a latest-ball API;
observed pages progress from earlier to later deliveries. These are recorded
observations, not an independently established universal upstream ordering SLA.

As records grow, upstream can increase pageCount. We forward it; we do not freeze
pageCount or compute it locally. Live growth and ID persistence have not been
re-measured during this incident. IDs are upstream play IDs, not synthesized
stable IDs; dedupe by provider + match + innings + id and allow corrections.
An empty/missing ID is not a reliable dedupe key. Do not promise immutable IDs.

`over` is numeric cricket notation, e.g. 15.3 means 15 overs + 3 legal balls,
not 15.3 arithmetic overs. Numeric 15.0 serializes as 15. Prefer ball/innings
context. No-ball/wide deliveries can share displayed over positions; over is not
an ID. `score` uses cumulative innings.runs, not delivery totalRuns.

Recommended ceiling per client: one visible commentary query per 20 seconds,
not an enforced account quota. Coalesce viewers in your proxy. Refresh page 1
for metadata then latest nonempty page as needed; do not download all pages each
poll. A moving tail may require the previous last page too. Preserve historical
page selection. Stop rapid polling completed matches; pause hidden tabs.

## Cache policy and errors

Candidate JSON responses explicitly use `Cache-Control: no-store`. Existing
application upstream caches still operate: live lists 15s, scorecard/detail 10s,
commentary 20s, squads/standings 300s. In-memory caches/single-flight are PER
INSTANCE, not a global rate limiter or shared cache guarantee.

No ETag/304 or s-maxage contract is implemented in this release. Avoid layering
shared-cache TTLs on top of upstream TTLs without accounting for source age;
responses also carry request-origin absolute links. Revisit conditional caching
as a separately measured change, not an unverified promise in an incident fix.

API-handler errors use JSON `{success:false,error:{message:string,...}}`:
400 invalid parameters; 404 unknown route/match or unavailable explicit fixture;
405 unsupported method; 502 upstream failures; 500 internal errors. Depending on
handler, error may also contain upstreamStatus, url and code. OPTIONS returns 204
without JSON. Image successes are binary, not JSON. CDN asset 404 bodies and
Vercel platform-level failures are outside this JSON-handler guarantee. The
reported 1-byte HTML asset errors were from the CDN, not proof API JSON was HTML.

No published/enforced global account rate quota exists in this repository.
Recommended polling: list15s; match10s; commentary20s; recent60s; upcoming120s;
standings/squads300s. On 429 honor Retry-After if present; otherwise exponential
backoff + jitter, e.g. 20/40/80 seconds, bounded retries. Don't rapidly retry 400,
404 or known dead assets. Do not clear last-good data or reset last-success time
on failed attempts. API CORS allows anonymous `*`; this says NOTHING about the
external image CDN's CORS or hotlink policy.

## Flags, images and drift contact

No independently verified national-team flag registry is included. `flagUrl:null`
for team objects is intentional; ship crest-only plus labeled monograms. No
franchise-to-country inference, invented paths, generic-logo substitutions or
CORS bypasses. A green HEAD means an image MIME was advertised at that time;
it does not prove valid file bytes, permanent MIME behavior, hotlink permission,
browser rendering, or future CDN availability. HEAD Content-Length is advertised
length, not measured downloaded bytes. Cross-origin img display and fetch/canvas
CORS are distinct. Validator records ACAO/CORP/cache-control/ETag if returned;
no policy guarantee is inferred when missing or network-blocked.

Report drift at https://github.com/Tabish955/CricketAPI/issues with route, provider,
match/league IDs, UTC observation time, status, headers and a redacted payload.
No private contact details or response-time SLA are established.
