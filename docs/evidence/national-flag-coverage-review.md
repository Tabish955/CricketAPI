# National flag coverage — pre-merge evidence

Code under test: `71f04df40c4308baaf181e6ffd80674290b9f3bf`, PR #8.
Production has NOT been changed by this PR. No merge authorized/performed.

## Remote build evidence

Vercel CI check PASS, preview READY:
https://vercel.com/ahmedtabish1000-gmailcoms-projects/cricketapi/B2XqCQJKc1ZCGxDpCNaNJq8bHPMn

Preview base:
https://cricketapi-emescj8wg-ahmedtabish1000-gmailcoms-projects.vercel.app

Final asset audit at 2026-11-27T15:10:47.965Z:
42 unique URLs, 42 green, zero red, zero unknown, zero discovery failures.
`NON_NULL_ASSETS_FAILING=0`. This includes crests and flags, not 42 country flags.
54 local tests pass. GitHub Actions has no claimed execution: the executed
remote harness is Vercel's build check. The Actions workflow uses the same harness
and is configured to upload flag-coverage.json with the existing evidence files.

The linked build log contains one `FLAG_CODE` JSON record for **every configured
key**, giving URL/status/MIME/measured bytes/verdict. `FLAG_SUPPLIED` and
`FLAG_NULL` records enumerate the complete current cb/live/recent/upcoming
inventory. They are also written as flag-coverage.json in the builder.

Selected directly inspected per-code GET harness lines (all HTTPS image/png):

```text
code     HTTP bytes verdict URL
bd       200  197   green   https://flagcdn.com/w40/bd.png
pk       200  310   green   https://flagcdn.com/w40/pk.png
in       200  193   green   https://flagcdn.com/w40/in.png
zw       200  352   green   https://flagcdn.com/w40/zw.png
ie       200  108   green   https://flagcdn.com/w40/ie.png
lk       200  464   green   https://flagcdn.com/w40/lk.png
au       200  393   green   https://flagcdn.com/w40/au.png
gb-eng   200  122   green   https://flagcdn.com/w40/gb-eng.png
gb-sct   200  297   green   https://flagcdn.com/w40/gb-sct.png
gb-wls   200  671   green   https://flagcdn.com/w40/gb-wls.png
nz       200  367   green   https://flagcdn.com/w40/nz.png
za       200  401   green   https://flagcdn.com/w40/za.png
af       200  655   green   https://flagcdn.com/w40/af.png
ae       200  123   green   https://flagcdn.com/w40/ae.png
na       200  595   green   https://flagcdn.com/w40/na.png
np       200  706   green   https://flagcdn.com/w40/np.png
id       200   99   green   https://flagcdn.com/w40/id.png
```

These rows are transcribed from the remote log, not sandbox network probes.
The complete exact configuration table (including Malaysia and all remaining
keys) is [FLAG-CONFIGURATION.md](../FLAG-CONFIGURATION.md). Configuration is not
itself a claim that every code occurs in today's fixtures.

## Indonesia sample and live-window limitation

All five chunks of published preview GET /cb/live were inspected: 19 matches;
Indonesia is absent. The Malaysia–Indonesia final has finished and moved to
/cb/recent. No fixture was fabricated or reclassified to manufacture a live sample.
Consequently, the specifically requested /cb/live sample containing IDN-W is
**not available in the current window**. The same mapping applies to live teams.

GET /cb/recent, fetchedAt 2026-11-27T15:12:06.016Z, live provider source:

```json
{
  "matchId": "1562331",
  "teams": "MAL-W vs IDN-W",
  "category": "recent",
  "status": "IDN Women won by 8 wkts (15b rem)",
  "team1": {
    "id": "299042",
    "name": "Malaysia Women",
    "short": "MAL-W",
    "imageUrl": "https://a.espncdn.com/i/teamlogos/cricket/500/299042.png",
    "flagUrl": "https://flagcdn.com/w40/my.png"
  },
  "team2": {
    "id": "1116740",
    "name": "Indonesia Women",
    "short": "IDN-W",
    "imageUrl": "https://a.espncdn.com/i/teamlogos/cricket/500/1116740.png",
    "flagUrl": "https://flagcdn.com/w40/id.png"
  }
}
```

Excerpt of the actual response, not an entire envelope. Existing scores retained
teamId 299042 and 1116740. Existing image URLs were not substituted.

## Full observed non-null flag inventory

Current cb windows, independently fetched from the preview, corroborated by
FLAG_SUPPLIED log records. These are the only ten supplied national team entries;
no national side occurs in this upcoming window.

| Route | Team ID | Team | Supplied flagUrl |
|---|---|---|---|
| /cb/live | 668 | Bangladesh A | https://flagcdn.com/w40/bd.png |
| /cb/live | 2938 | Pakistan A | https://flagcdn.com/w40/pk.png |
| /cb/live | 3858 | Zimbabwe A | https://flagcdn.com/w40/zw.png |
| /cb/live | 2223 | Ireland A | https://flagcdn.com/w40/ie.png |
| /cb/live | 5 | New Zealand | https://flagcdn.com/w40/nz.png |
| /cb/live | 6 | India | https://flagcdn.com/w40/in.png |
| /cb/recent | 2 | Australia | https://flagcdn.com/w40/au.png |
| /cb/recent | 1 | England | https://flagcdn.com/w40/gb-eng.png |
| /cb/recent | 299042 | Malaysia Women | https://flagcdn.com/w40/my.png |
| /cb/recent | 1116740 | Indonesia Women | https://flagcdn.com/w40/id.png |

## Full observed null flag inventory

Reasons below are evidence/report text only, NOT additional API fields.
Domestic/regional sides never inherit their host country's flag. No West Indies
side is in this snapshot; WI and all variants nevertheless remain explicitly
unmapped/null (multi-country, no ISO substitution).

### /cb/live — 32 sides

Domestic clubs/franchises/provincial associations, not national representatives:
- 1133698 Sharjah Warriorz; 1346029 Dubai Capitals
- 2516 Northern Districts; 2482 Central Districts
- 2570 Otago; 2600 Wellington
- 3203 Easterns; 3228 Northern Cape
- 3161 Boland; 3202 Knights
- 3353 Warriors; 3199 Dolphins
- 3249 Lions; 3278 North West

Explicit regional sides, not national representatives:
- 382592 Abbottabad Region; 919697 Pakistan-administered Kashmir Region
- 919049 Bahawalpur Region; 3061 Rawalpindi Region
- 919699 Dera Murad Jamali Region; 1561008 Sialkot Region Whites
- 2753 Hyderabad Region; 2789 Karachi Region Whites
- 2857 Lahore Region Blues; 2871 Larkana Region
- 1561010 Peshawar Region Whites; 3047 Quetta Region
- 2858 Lahore Region Whites; 2788 Karachi Region Blues
- 1561012 Sialkot Region Blues; 382591 Islamabad Region
- 2905 Multan Region; 1561013 Peshawar Region Blues

### /cb/recent — 10 sides

Domestic clubs/franchises (not national women):
- 896405 Perth Scorchers Women; 896433 Hobart Hurricanes Women
- 3340 Titans

Regional/provincial sides (not national U19s):
- 1290548 Karnali Province Under-19s; 1290547 Lumbini Province Under-19s
- 1290546 Gandaki Province Under-19s; 1345526 Madhesh Province Under-19s
- 3357 Western Province
- 3001 Federally Administered Tribal Areas; 2706 Faisalabad Region

### /cb/upcoming — 12 sides

Domestic women's franchises (not national women):
- 896401 Sydney Thunder Women; 896403 Sydney Sixers Women
- 896407 Melbourne Renegades Women; 896399 Melbourne Stars Women

Domestic provincial associations (not national sides):
- 2459 Auckland; 2469 Canterbury
- 2467 Auckland Women; 2522 Northern Districts Women
- 2480 Canterbury Women; 2608 Wellington Women
- 2488 Central Districts Women; 2576 Otago Women

## Preservation boundary

Only the flag mapping, explicit variant aliases, diagnostic reporting, tests and
configuration documentation changed. No imageUrl policy, score/teamId logic,
JSON serialization or Cache-Control handling changed. Shared build-time asset
checks still run, so deployment-time upstream asset changes remain separately
observable. Evidence is a dated snapshot, not a permanent CDN guarantee.

**Merge hold remains.** The Indonesia /cb/live sample cannot be supplied while
the actual match is correctly in recent; the recent sample proves the fixed
mapping without altering the live/recent contract.
