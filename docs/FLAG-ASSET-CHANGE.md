# National flags and strict team asset gate (unmerged candidate)

Exact national names and explicit A/XI/women/U19 aliases are mapped to country
ISO codes in `src/national-flags.js`. No substring matching or suffix stripping
is used. A club name overrides a potentially ambiguous abbreviation. West
Indies (multi-country) intentionally remains null rather than being assigned
a member-country flag. England/Scotland/Wales use explicit ISO3166-2
subdivision flags, independently validated, rather than the UK flag.

Every deploy builds a fresh URL allowlist using HTTPS GET, exact HTTP200,
image/* content type, positive measured body length <=204800 bytes, and HTTPS
final redirects. Unknown URLs at runtime are null even if new fixtures appear.
This deliberately trades image coverage for fail-closed delivery. External CDN
availability can change after build: no build-time check can guarantee perpetual
reachability. No random or guessed crest replacements are used.

Only team imageUrl/flagUrl values change; squads gain the permitted flagUrl
using their existing teamName. Player portraits, scores/teamId and JSON cache
headers are not modified by this change. The discovery bypass is local to the
build process and is removed before the final HTTP audit.

The shared Vercel build and Actions harness writes:
- asset-verification.json: raw/preflight and sanitized inventories plus measured
  per-URL GET results, including failure reasons/status/MIME/bytes.
- asset-samples.json: /cb/live and requested ESPN match detail with headers.
- asset-null-teams.json: explicit observed team/route list and null reasons.
- asset-validation.log: grep `NON_NULL_ASSETS_FAILING=0` and audit summaries.

A failed final audit, missing required bd/pk flags, provider discovery failure,
or an empty URL inventory fails the gate. Artifacts must be reviewed and posted
before merge. This file is not a claim that remote verification has passed.
