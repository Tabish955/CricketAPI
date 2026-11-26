# Crest/flag incident — candidate, NOT deployed

## Root cause and boundary

Cricline supplied production-origin measurements dated 2026-11-26: ESPN /500/
IDs 1346027, 1336141, 1336151, 3161 returned HTTP404/text-html/1 byte;
1781,3590,520 returned image/png with reported sizes 10,376/40,963/234,791 B.
These are user-provided measurements, not independently reproduced results.

Our ESPN adapters forward upstream logo URLs without checking existence. The
recorded ILT20 upstream fixture itself contains the failing 1346027 URL. Thus
unvalidated upstream pass-through is established; stale IDs, mapping error at
ESPN, intermittent eviction and alternate assets remain UNRESOLVED. No evidence
justifies replacing an ID, guessing a size/subfolder, or calling this CDN culling.

## Remediation prepared

- Exact four reported-dead URLs excluded in src/team-assets.js; return null.
  Other sizes/hosts for the same ID are not fabricated or automatically excluded.
- Empty/absent team crest references become explicit null at the JSON boundary;
  player portraits are not rewritten. ESPN normalizers apply the policy too.
- Add flagUrl:null: no verified national-team flag mapping; ship crest-only.
- Add scores[].teamId using provider identity or unique exact local team match;
  ambiguous/unknown matches stay null. Keep existing display strings/routes.
- Explicit JSON no-store; upstream TTL caches retained. No unverified ETag,
  s-maxage, CDN hotlink, MIME or CORS guarantee.

## Before/after evidence and counts

`docs/evidence/asset-local-http-before-after.json`: actual local HTTP GETs to
baseline commit 6128331 and candidate, using the SAME recorded standings fixture.
This is not a fresh production inventory or live CDN verification.

| Metric | Baseline | Candidate |
|---|---:|---:|
| HTTP status / MIME | 200 / application-json | 200 / application-json |
| Teams in replay | 6 | 6 |
| References matching four reported-dead URLs | 1 | 0 |
| Null crest references | 0 | 1 |
| Cache-Control | absent | no-store |

All four URL exclusions are covered by tests, but only one appears in this
six-team replay. Other retained URLs are NOT claimed green without HEAD proof.

`docs/evidence/asset-network-attempt.json`: validator ran against production with
explicit standings20921; 12 discovery requests failed at network layer, zero
assets discovered, gate=false. Production before/after red/green counts are
UNKNOWN, not zero. Direct sandbox curl HEAD also failed TLS, not HTTP404.
All seven supplied CDN URLs were separately HEAD-probed; each failed at the
network layer (status null, verdict unknown). Those attempts are retained in
`docs/evidence/incident-cdn-head-attempt.json`. No replacement CDN asset or policy
could be verified from this environment.

## Validator and release gate

Run from a network-enabled machine/runner:

```
API_BASE=https://cricketapi-beryl.vercel.app node scripts/validate-team-assets.mjs --standings=/espn/standings/20921 --out=asset-before.json
API_BASE=http://127.0.0.1:3000 node scripts/validate-team-assets.mjs --standings=/espn/standings/20921 --out=asset-after.json
```

The candidate must run in DATA_MODE=live. Validator scans cb/espn/crex live,
recent/upcoming, Cricinfo current/live, and standings for discovered ESPN/cb
leagues. Add explicit --standings paths for undiscovered/Sportskeeda series.
It does not claim coverage of every historical route, league or client cache.
HEAD probes record status/MIME/advertised length/cache/CORS headers. A network,
429 or HEAD405 response is UNKNOWN, not a reason to delete an asset. Gate fails
for incomplete discovery, empty inventory, red or unknown assets. No credentials,
Origin/Referer spoofing or CORS bypass is used. All deduplicated URLs are retained
with IDs/names/routes; this avoids collisions between providers with the same ID.

Prepared workflow `.github/workflows/data-contracts.yml` runs tests, records a
production baseline and gates a local candidate HTTP+CDN audit on PR/push/manual
runs, uploading reports even on failure. It has NOT run on GitHub yet. Required
check/branch protection and Vercel promotion enforcement must be configured or
confirmed by the repository owner: a workflow file alone does NOT block Vercel's
independent automatic deployment. Do not push/promote automatically for this task.

## Status / remaining work

49 tests pass; git diff check clean. No push, merge, project settings change or
deployment performed. The requested imageUrl:null type widening needs consumer
review before release; unrelated legacy fields are not globally converted.
Before release: run live before/after audits externally, inspect all remaining
red URLs, verify any replacement and browser behavior, review the resulting
counts/HTTP headers, then obtain deployment approval. Live commentary growth,
ID stability, and CDN hotlink/CORS guarantees remain unverified. Full field and
operational contracts: docs/API-CONTRACTS.md.

## Independent Vercel build evidence

Build `dpl_ztMoSupQmCk4tW9GGkTfimscUEDz` audited stable production:
114 unique URLs, 61 green, 53 red, zero unknown or discovery failures.
Build `dpl_HSQwBPYQY1cpLu92fDtTZk2kpmjF` independently confirmed missing
exact URLs with HEAD plus GET (404 text/html, one-byte bodies in inspected
records). After build-time exclusions, candidate HTTP audit at
2026-11-26T16:40:13.357Z: 61 URLs, all 61 green, zero red/unknown/discovery
failures, 155 null references (occurrences, not unique teams). 50 tests passed.
This is live-provider candidate HTTP proof from the Vercel builder, not proof
of a published deployment. Packaging then failed for missing `public/` output;
an empty tracked directory fixes that configuration requirement. Production
has not been merged or promoted.

Each build inventories both production and the unremediated live candidate,
GET-confirms only HEAD404/410 URLs, writes an exact exclusion manifest into the
function bundle, and re-audits the sanitized HTTP payload. Any remaining red,
unknown, missing discovery or empty inventory fails the build. No nationality
or alternative logo is guessed. Snapshot exclusions cannot guarantee future
upstream URLs; rerun the inventory on every deployment. Full per-URL HEAD and
GET confirmation records are in the linked Vercel build logs.
