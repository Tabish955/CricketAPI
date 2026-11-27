# Genuine logo recovery — preview evidence

Code tested: ac8f91a3d7e71faf014a46cc08dc30f5a2612e17, PR #9.
Remote check PASS; deployment READY (preview, not production).

Build log: https://vercel.com/ahmedtabish1000-gmailcoms-projects/cricketapi/5dZZYtfnukpDDvcgGLHVDcivMLsj

Published preview: https://cricketapi-1bsevz2r2-ahmedtabish1000-gmailcoms-projects.vercel.app

## Seven primary-source candidate URLs passed the remote GET harness

All HTTPS, exact HTTP200, image/png, measured positive body <=204800B.
Paths and primary-page provenance are in src/logo-candidates.json.

| Team ID | Team | Measured bytes |
|---|---|---:|
| 1346027 | Abu Dhabi Knight Riders | 187407 |
| 1346029 | Dubai Capitals | 47249 |
| 1346030 | Gulf Giants | 3462 |
| 1346066 | Desert Vipers | 4943 |
| 1328788 | MI Emirates | 6809 |
| 1133698 | Sharjah Warriorz | 7421 |
| 896399 | Melbourne Stars Women | 9016 |

These are separately observed genuine images, not siblings guessed from the
broken /500/ paths. Their old exact dead URLs remain excluded. Transport and
identity checks are separate requirements. Existing valid crests remain preferred.

## Published HTTP payload verification

GET /espn/standings/20921, fetchedAt 2026-11-27T15:31:34.825Z,
meta.source.source=live, contains all six ILT20 teams above, each with a non-null
hscicdn imageUrl. Each flagUrl correctly remains null (clubs, not countries).
For ADKR, an excerpt is:

```json
{
  "id": "1346027",
  "name": "Abu Dhabi Knight Riders",
  "short": "ADKR",
  "imageUrl": "https://img1.hscicdn.com/image/upload/f_auto/lsci/db/PICTURES/CMS/349600/349617.png",
  "flagUrl": null
}
```

## Final remote inventory

2026-11-27T15:31:12.520Z: 49 unique emitted asset URLs, all49 green,
zero red, zero unknown, zero discovery failures. 174 null image references
remain across all inventoried routes (occurrences, not unique teams).
57 local tests passed. No GitHub Actions run is claimed: executed remote proof
is Vercel's shared build harness. Artifact upload is wired for Actions.

## What is not solved

This is NOT every team's logo. Automated public-page discovery received403
for observed missing teams, including regional/U19 sides and many domestic
associations. Those responses are logged as unresolved, never bypassed or
silently converted into made-up marks. We could inspect primary pages using the
page-fetch tool and preserve seven explicit candidates, but that does not make
server-side page discovery available from Vercel's network origin.

REA6.10.1 would not start on the sandbox's Node22.22.3; no REA runtime evidence
is claimed. Details and investigative sources are in docs/LOGO-RECOVERY.md.
National flag behavior, WI=null, score team IDs and no-store remain unchanged.

Production unchanged. Hold merge pending review. The subsequent evidence/report
commit corrects LOGO_RECOVERED to compare against actual production baseline,
not preflight which can already expose candidate URLs; this does not change
runtime asset selection.
