# Identity-bound team logo recovery (candidate, not production)

## Investigation

Current production forwarded many missing ESPN /500/ marks. We inspected primary
Cricinfo team pages and their fixture headers, not a logo lookalike search result:
- https://www.espncricinfo.com/team/abu-dhabi-knight-riders-1346027
- https://www.espncricinfo.com/team/dubai-capitals-1346029

The pages expose different hscicdn image paths for ILT20 franchises and WBBL
sides. Exact observed URLs and identity names/IDs are retained in
src/logo-candidates.json. These are *candidates*, not automatically trusted
substitutes: each must independently pass the existing image GET harness.
Existing valid imageUrl is preferred. Flags and logos remain separate fields;
clubs never inherit host-country flags. West Indies flagUrl stays null.

Additional research lead, not imported as verified asset data:
sportsdataverse/sdv-assets curated/cricinfo_teams.csv at
3dd3b54f4bacee3aea20a4a3eb18045e85931307 documents archival provider paths.
No bulk third-party asset mirror, downloaded binary logos, guessed image size
paths, authentication workaround or fabricated fallback images are shipped.

## REA result and limitation

No installed REA CLI, browser, MCP tools or skill files were present. Read the
upstream REA skill and recovery instructions, then attempted from /tmp:
`npx -y rea-agents@latest --help`. REA6.10.1 refused to start: available Node
22.22.3 is below its required 22.23.4 /24.22.1 /26.12.1 runtime versions.
Therefore **no REA runtime observation was obtained**. Source/page inspection
and remote HTTP validation are labelled as such, not passed off as REA output.
No runtime or project dependency upgrade was made merely to force REA to run.

## Deploy-time discovery

For current inventoried teams with missing/failing images, fetch a normal public
Cricinfo team page. Candidate discovery requires matching canonical numeric ID,
full team name in page title, HTTPS provider image host/path, and an inline image
labelled for that team using the same image path. A generic social image is not
enough. Failed/blocked/ambiguous pages remain unresolved, with explicit logs.
The per-team registry requires BOTH ID and exact full name (case/whitespace
normalization only); IDs are not globally interchangeable across providers.

Every discovered candidate then passes GET200, image MIME, HTTPS final URL,
positive measured body <=204800B. Runtime only uses candidates recorded green
in the generated validation manifest. Known-dead URLs stay excluded; this does
not prevent a separately verified genuine image at a different observed URL.

Artifacts/log tags: logo-discovery.json / LOGO_DISCOVERY / LOGO_CANDIDATE;
logo-recovered.json / LOGO_RECOVERED; existing final inventory/flag coverage
reports remain enabled. A complete inventory of all historical cricket teams
is not available; this work does not promise 100% worldwide coverage.

Do not merge/promote before actual remote evidence is posted and reviewed.
