# Multi-source flags and cricket logos: research inventory

Research recorded 2026-11-24 (session date). Counts below are inspected snapshots,
not independently validated usable images. No runtime mappings changed.

## Largest new lead: Cricbuzz-derived catalog

https://github.com/hashirhamxa/cricket_events

Inspected `data/teams/teams.json` and repository tree using GitHub API.
Snapshot commit: `e14e813a35b1ed56464a489573b0058e000b420e`.

- 1,025 team records, all with imageId and logo fields.
- 1,025 files under images/teams/ in the inspected tree.
- Categories as supplied (NOT independently verified): 419 T20_LEAGUE,
  402 DOMESTIC, 155 WOMEN, 38 INTERNATIONAL, 11 OTHER.
- Missing-coverage leads include Limpopo (Cricbuzz912, imageId248430),
  Pakistan A (325,776313), Bangladesh A (288,776212).
- Repository README describes Cricbuzz scraping and cached branding.
- GitHub repository metadata returned license=null. Public visibility is NOT a
  redistribution license. Do not bulk-copy/hotlink this mirror as an approved
  asset source without resolving rights. It is useful as an identity/source lead.
- Primary page https://www.cricbuzz.com/cricket-team/limpopo/912 resolves with
  team-specific title. Page-fetch main image is generic editorial art, NOT an
  approved team logo. CDN candidates still need independent identity evidence.

## Other sources

| Source | Observed value | Limitation / next gate |
|---|---|---|
| Cricbuzz public directory https://www.cricbuzz.com/cricket-team | Primary provider directory and team pages accessible through page-fetch | Directory response includes generic site chrome. Extract labelled team assets, not og:image. Respect terms/access controls. |
| CREX https://github.com/dheerajgoel17/cricket-data/blob/main/src/cricket_site/crex_assets.py | Independent implementation demonstrates team sitemap identity matching and image CDN strategy | Research lead only. Attempt to fetch https://crex.live/sitemap/teams.xml failed; this path is not confirmed. Do not invent CDN paths from IDs. |
| Sportmonks https://docs.sportmonks.com/v2/cricket-api/our-api/teams-and-players/get-all-teams | Official all-teams endpoint returns id,name,code,image_path,national_team; API-key authorization; docs say no pagination | Requires authorized API access/plan and rights review. Documentation examples are not a complete live database. Do not copy provider IDs into ESPN namespace. |
| TheSportsDB https://www.thesportsdb.com/free_sports_api | Official page offers JSON sports data and artwork, free access with premium options | Cricket-specific completeness, badge identities and API limits not enumerated in this investigation; no coverage count claimed. |
| albtree/cricket-headshots https://github.com/albtree/cricket-headshots/blob/main/team_info.csv | 205 CSV rows inspected at 632a65c159618e853cc46e555fc5fe06ed62803f, team/abbr/logo_url/color/league | A useful catalog but observed URLs include Cricinfo, so not necessarily an independent origin. No binary validation or rights approval. |
| Flagpedia / FlagCDN https://flagpedia.net/download/api | Official docs advertise 254 country flags, PNG/WebP/SVG/JPEG, JSON code list, free CDN embedding/download | Country flags only, not franchise crests. Explicit sporting-identity mappings required; WI stays null. Not a newly validated runtime fallback. |
| Wikimedia Commons | Flagpedia identifies Commons as vector source | Per-file licensing/provenance review needed for direct Commons use; no new cricket inventory inspected here. |

### 205-row CSV breakdown

125 International; 11 IPL; 8 each BBL, Hundred, women's Hundred, WBBL;
7 Bangladesh Premier League; 6 each ILT20, PSL, SA20, WPL, MLC.
Rows are not necessarily distinct current teams (historic names may appear).
`albtree/cricreadR/R/load_team_logos.R` explicitly reads this CSV; therefore
cricreadR and cricket-headshots must not be counted as two independent databases.

## Recommended integration approach

1. Prioritize Cricbuzz primary identity/asset evidence for current missing sides;
   use the 1,025-record catalog to discover names/IDs, not as blanket approval.
2. Expand to CREX, official league/team pages and authorized Sportmonks data.
   Use TheSportsDB as another independently reviewed fallback, not a promise.
3. Maintain provider-qualified IDs and an explicit crosswalk to feed team IDs.
   Require full name, gender, age group and team level; abbreviations alone are
   insufficient. Rebrands and men's/women's shared names require review.
4. Store exact observed URL, source page, provider ID, matching evidence and
   rights status for each candidate. Deduplicate shared image URLs separately
   from team records. Prefer current primary evidence over historical mirrors.
5. Reuse existing HTTPS GET200/image MIME/positive measured <=204800B validation
   before emitting any new URL. No anti-bot bypass, numeric asset enumeration,
   placeholder flags, or client-side URL construction.
6. Report net recovered unique teams and remaining missing unique teams,
   separately from reference occurrences and discovered candidate counts.

This research corrects the earlier ESPN-only recovery strategy. It does not
claim 1,025 verified assets, universal coverage, successful CREX access, or new
production coverage. No third-party binary assets or full datasets imported.
