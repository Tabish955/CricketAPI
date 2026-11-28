# Player profiles and career integration

## Diagnosis

The website's PlayerObserved component originally requested only ESPN match
scorecards and squads. Separately, the existing Cricbuzz profile parser omitted
career tables and biography, and its `/profiles/{id}` URL now returns 404 without
a slug. Dependency updates do not fix either issue.

## API contract

`GET /espn/player/:id` accepts a numeric ESPN player ID, independent of match,
league or date. Response: `{success, result: {found, player}, meta}`. HTTP output
retains `Cache-Control: no-store`. Internal upstream caching is one hour.

Player fields:

- `provider: "espn"`, `playerId`, `name`, `shortName`, `personalInfo`, `team`.
  Team means published membership, not inferred nationality. `personalInfo.born`
  preserves ESPN's display text; `birthDate` normalizes its observed day/month/year.
- `imageUrl`: nullable verified player portrait. Exact ESPN published headshot,
  or a name-labelled portrait from the independently verified Cricbuzz profile;
  every non-null URL passes measured GET 200/image MIME/positive <=200KB.
  No ID-derived portrait URL, placeholder or guessed CDN resize is exposed.
- `biography`: plain text or null; no raw HTML reaches the client.
- `careerStats.batting` / `careerStats.bowling`: null or `{title, formats}`.
  Each format contains its published `format` label and a `statistics` dictionary.
  Values remain strings or null. A published zero stays `"0"`; absent figures
  do not become zero. Formats are not relabelled (T20 is not inferred T20I).
- `careerSourceUrl`, `careerProvider`, `careerPlayerId`: separate source identity.
  The ESPN ID is never replaced by a Cricbuzz ID.
- `careerUpdatedAt: null`: retrieval time does not establish statistical freshness.
- `careerCoverage`: explicit coverage/unavailability explanation.

Career-provider failures or mismatches leave valid ESPN personal information
available, with null career fields. Failure of ESPN identity retrieval fails the
request, rather than displaying a different player or a fixture.

The legacy Cricbuzz profile endpoint also uses `/profiles/{id}/player` for
all provider-local IDs, not only reviewed entries. Public player search uses
`/api/player-search/{encoded name}` rather than the obsolete JSONP route.

## Identity coverage — automatic for every player

There is no per-player eligibility list. For any valid ESPN profile:

1. Use the published short/display names (at most two unique queries) to query
   Cricbuzz's public autocomplete. Its observed JSON includes provider-local ID,
   published name and ISO full birth date. No-hit payloads contain only category.
2. Require exactly one unique ID matching an exact normalized published name AND
   the full ESPN birth date. Same-name/different-DOB players are not interchangeable.
   Name-only/fuzzy/initials matching and numeric-ID reuse are prohibited.
3. Fetch `/profiles/{discovered Cricbuzz ID}/player`; independently verify the
   profile's published canonical/og URL ID, title/name and DOB before importing
   any biography or tables. Missing identity evidence fails closed.
4. The existing five reviewed pairs are retained only as an optimization and for
   reviewed full-name aliases, with the same runtime profile checks, not a gate.

Missing DOB, no match, ambiguity, identity rejection and upstream outages have
explicit coverage explanations. Personal ESPN information remains available.
No provider publishes complete career data for every player: universal lookup
eligibility does not promise universal biography/statistics availability. Partial
batting/bowling coverage stays nullable. Match statistics remain separate.

Search is cached/single-flight for one hour, as are ESPN profile results. At most
two concurrent search reads and one profile read occur for a new unmapped player;
normal upstream timeouts apply with no retries. No portrait assets are added.

## Historical live source research (initial limited implementation)

Public JSON identity source:
`https://site.web.api.espn.com/apis/common/v3/sports/cricket/200/athletes/{id}`.
Public profile URLs are listed verbatim in the registry.

Research builds on the existing API project, without production promotion:

- `dpl_AGmQCXMuy8MUxA8KnD5vT14TFUTf`: ESPN 253802 and 277906 return HTTP 200,
  with matching identities and DOB. Athlete JSON has no biography/career totals.
  Cricinfo HTML returns 403; no attempt is made to bypass that denial. The
  research build itself subsequently failed due to a missing public directory.
- `dpl_DJM3bx4oYQ77aGTRxfhnuKNwF8mJ`: ESPN `/stats` returns 404; `/bio` and
  `/overview` return 500; hs-consumer player/home returns 403. Cricbuzz Dhoni
  profile returns 200 and contains `section#player-bio` plus career tables.
  Cricsheet's public register returns 200, but its Cricbuzz IDs for the sampled
  players are blank, so it cannot supply those identity links.
- `dpl_FNKTmE7xi9YEkF7L7Tsr6ZFezLeP`: bare `/profiles/{id}` URLs and legacy
  player-search endpoint return 404. They are NOT viable discovery mechanisms.
- `dpl_5E3mHY9J1DCBup5KPWArAq6bS6no`: all four exact published Cricbuzz URLs
  return 200 with biography containers. Kane's raw DOM confirms the modern
  career table layout and personal-information labels. ESPN Dhoni identity
  returns 200; Gill's first identity probe returned 504, not a valid identity
  verification. Runtime checks remain mandatory and endpoint evidence must
  establish coverage before a release claim.

Cricbuzz's retrieved Dhoni IPL figures end in May 2025; totals must not be called
current 2026 data. The UI labels statistical update date as not supplied.

## Website delivery

Website code remains in the separate Cricscore workspace/repository. The new
PlayerCareer component requests the ESPN-ID endpoint through the existing
same-origin allowlisted proxy, independently of match requests. It renders
personal details, attributed biography and nullable career tables separately
from match performances. No new images, rankings or records are imported.
Source URLs are validated and biography is rendered as escaped text, never HTML.
The user receives changed website files only, never API code in the website ZIP.

## Verification

- API: 84 offline tests pass, including parser, runtime identity rejection,
  provider outage, exact fixture, no-store and no-substitution cases.
- Website: TypeScript, 205 tests (23 files), production build pass.
- `fixtures/espn-player-253802.json` is a trimmed public identity response from
  the observed ESPN source; synthetic career examples exist only in tests.
- `scripts/player-evidence.mjs` reports actual candidate endpoint results,
  biography hashes/lengths and career figures during the Vercel build. Optional
  provider availability is reported separately from existing asset build gates.

The candidate endpoint subsequently passed live checks for all four reviewed
players, including Gill. See [candidate HTTP evidence](PLAYER-PROFILE-EVIDENCE.md)
for IDs, biography hashes and sampled career figures. No production merge or
website deployment is implied by local tests or research builds.
