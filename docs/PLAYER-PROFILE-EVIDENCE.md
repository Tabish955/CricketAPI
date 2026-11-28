# Player endpoint candidate evidence

Candidate commit: `3607c74c42e13763c701c11a78f5fe8ba6fd8fc2`.
Vercel preview build: `dpl_8uAuu6uyN9Z4P2YVYg2x9zgoMMxf`.
The preview reached READY. The following table is build-time HTTP evidence
against the candidate server using live sources, not a production website/browser
verification.

`PLAYER_PROFILE_SUMMARY`: passed=true, covered=4, total=4.
Every request returned HTTP 200, Cache-Control=no-store, provider=espn,
matching playerId, null imageUrl and nonempty batting/bowling career tables.
Both provider namespaces remained separate.

| ESPN ID | Returned name | Birth date | Cricbuzz ID | Biography characters | Test matches / runs |
| --- | --- | --- | --- | --- | --- |
| 253802 | Virat Kohli | 1988-11-05 | 1413 | 17117 | 123 / 9230 |
| 277906 | Kane Stuart Williamson | 1990-08-08 | 6326 | 7368 | 110 / 9515 |
| 28081 | Mahendra Singh Dhoni | 1981-07-07 | 265 | 16365 | 90 / 4876 |
| 1070173 | Shubman Gill | 1999-09-08 | 11808 | 7511 | 45 / 3158 |

These are the provider's retrieved figures, not independent statistical
verification or a claim of current/latest totals. No statistical update date
was supplied. The source's `T20` label was retained, not relabelled as T20I.

## Biography SHA256

- 253802: `a6c2231efceea08a84943eae78191cc784a52914ac9847cf1f5b946bbe0abb63`
- 277906: `3afc381c19b44588d2bb6f2d00cd1f7144f7da3d8279333e1be03b8331ba535d`
- 28081: `895dbfec7eac1b4be9517cd3614f1e3b79c3ded19d62286853e869a4f8e02e3d`
- 1070173: `1b511cf7d505eb4321d2d8ad6e53e1928c234c3572cb3d1f83b80fb5dfd999e3`

The logs retain hashes/lengths, not copied biography bodies. Actual data is read
from the published URLs in src/player-profile-links.js. No player image was
introduced, so no new nonnull image validation claim is needed.

## Deployed preview HTTP checks

The public preview `/espn/player/277906` was fetched after READY and returned
success=true, ESPN identity 277906, the complete biography, and Cricbuzz source
6326. `/espn/player/1070183` returned Abhishek Sharma's ESPN personal profile with
biography=null, both career tables=null, and an explicit no-reviewed-link reason.
This confirms the uncovered-player path does not borrow a reviewed player's data.
The shared response sanitizer can attach already-validated team flags to team
objects; the website profile component does not render them. No new portrait or
team-asset URL was introduced by the player feature.

Offline verification: 73 API tests, 205 website tests (23 files), website
TypeScript and production build pass. The website patch remains outside this
API repository. Production release requires explicit merge approval.
