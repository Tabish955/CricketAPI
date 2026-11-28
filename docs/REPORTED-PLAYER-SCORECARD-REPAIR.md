# Reported player and scorecard repair

## Confirmed production facts at investigation

- Website GitHub main remains 565e7ec (dependency patch). It does not include
  the separately delivered career-profile UI. The quoted obsolete notice is
  present in that source. Merging API PR12 did not publish website files.
- Production `/espn/player/300631` returns Kusal Perera's ESPN identity and DOB
  1990-08-17, but no career data because the original four-player registry did
  not include him. That limited coverage did not satisfy his page.
- Production `/espn/match/1557451/scorecard?league=1557442&date=20261128`
  currently returns detailed batting/bowling rows, including Perera 76 from 45.
  The missing-scorecard incident was not reproduced for this exact request.
  Other affected match IDs/website URLs are still needed for exact diagnosis.

## Backend changes

- Add reviewed ESPN300631 -> Cricbuzz8116 using the exact published source
  https://www.cricbuzz.com/profiles/8116/kusal-perera. Source name, DOB and ID
  remain mandatory runtime checks; no search-based mapping or ID reuse.
- Allow identity-checked summary fallback even when the league scoreboard
  throws an upstream error. Previously that failure exited before fallback.
- Preserve innings present only in summary player rows/sections, rather than
  mapping exclusively over scoreboard totals and losing published player data.
- Keep missing scores absent, not 0/0. Preserve primary live summary provenance
  and attach unavailable scoreboard metadata separately.
- Three regression tests cover scoreboard outages, wrong-event rejection and
  summary-only innings. These demonstrate possible failure paths, not proof of
  the cause of every reported website failure.

## Website changes (separate workspace only)

Rebuild a baseline-565e7ec-compatible website patch containing PlayerCareer,
its proxy allowlist rule, PlayerObserved integration, route documentation and
six regression tests. Profile requests are independent of scorecard requests,
identity checked, source constrained, escaped text, same-origin and no-store.
No old dependency patch is included or overwritten. No website push is made.

Current candidate verification: API 76 tests pass; website 203 tests / 23 files,
TypeScript and production build pass. Live candidate evidence is emitted by the
existing Vercel build for Kusal and the exact reported scorecard. Production
release is not implied until the new API PR is approved and deployed, and the
website patch is separately applied, pushed and its deployment verified.

Career coverage is now five reviewed players, not universal coverage. The
website can load personal details for other ESPN IDs but cannot invent missing
career coverage. No new player image, ranking or record is introduced.
