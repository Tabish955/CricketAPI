# Automatic player coverage — PR 14

The fixed eligibility gate is removed. Every valid ESPN player profile can use
public name/full-DOB discovery. The five historical reviewed links are only fast
paths. No additional player entries were needed for these successful live checks.

## Verified candidate

Implementation commit: `e3dc3ec1875446d591e9621edb390c52c15310a1`.
Vercel deployment: `dpl_EeZusY6p5zhevFK3qrf1nzfPDo5V` (successful build).
Candidate base:
`https://cricketapi-mp09w4t2g-ahmedtabish1000-gmailcoms-projects.vercel.app`

Public deployed `/espn/player/{ESPN ID}` responses were read directly, not just
source pages or synthetic fixtures. All the following returned success with
biography and both career tables, ESPN namespace intact, imageUrl null and
careerUpdatedAt null:

| Player | ESPN ID | Discovered Cricbuzz ID | Full DOB | Sample published batting figure |
| --- | --- | --- | --- | --- |
| Abhishek Sharma | 1070183 | 12086 | 2000-09-04 | T20 Matches 72, Runs 2268 |
| Smriti Mandhana | 597806 | 10012 | 1996-07-18 | WPL Matches 35, Runs 1023 |
| Nicholas Pooran | 604302 | 9406 | 1995-10-02 | ODI Matches 61, Runs 1983 |
| Shashank Singh | 377534 | 10919 | 1991-11-21 | IPL Matches 53, Runs 905 |

The public search for Abhishek Sharma returns three same-name IDs, with DOBs
2000-09-04, N/A and 2001-01-02. Only 12086 passes the name/full-DOB check.
Mandhana's ESPN display name includes Shriniwas; her independently published
shortName supplies the exact cross-provider alias. Shashank verifies a
domestic/franchise player outside the original registry. These are sampled live
figures, not a claim that source statistics are up to date.

Reviewed-path regression check: deployed `/espn/player/300631` still attaches
Cricbuzz 8116 and career tables after independent canonical identity validation.

## Repeatable verification

- `npm ci --ignore-scripts`: zero reported dependency vulnerabilities.
- `npm test`: 84 passing offline tests.
- Tests cover same-name/different-DOB candidates, identical hit deduplication,
  ambiguity across both published name searches, missing DOB, fuzzy/name-only
  rejection, invalid IDs, missing/wrong canonical profile identity, wrong
  name/DOB, search outage, no hits, women's names, partial tables and source zeros.
- Build-time evidence now samples the three new international/women's profiles
  alongside the original reviewed profiles. It remains separate from asset gates.
- Existing endpoint no-store and fixture no-substitution tests remain passing.

## Release and website

This is an API-only change, using the same profile contract already consumed by
the user's applied website update. No new website ZIP/push is required for this
API coverage change. It is a preview, not a production promotion or merge.

All-player eligibility is not a promise that Cricbuzz has a biography or career
record for every person. Missing names/DOBs, uncertain identities, unpublished
figures and upstream outages stay explicitly unavailable; never attach someone
else's data just to fill a page. Match performance stays separate from career
statistics. No new images, nationality inferences, source-access bypasses or
invented career update dates are introduced.
