# Player photos and disappearing badges — PR15

## Confirmed boundaries

The profile API previously unconditionally emitted imageUrl:null; the user's
applied website PlayerCareer schema/component also dropped/did not render photos.
Both API and website changes are required for pictures, unlike PR14 career lookup.

Public cricline.vercel.app homepage and NZ/India match 1539443 were fetched.
Both server-rendered pages advertise ESPN crest URLs. Production API detail has
both crest and flagUrl for New Zealand and India. This does NOT reproduce every
reported browser disappearance: network/cache/hydration behavior on the user's
device remains unobserved. Website code nevertheless shows concrete gaps:

- TeamBadge reset loaded=false in a passive effect on index changes; cached load
  events can race this. Loaded state is now source-bound, not effect-reset.
- Teams, team detail and standings omitted feed flagUrl props.
- Detail normalization only merged list assets at fetch time; detail arriving
  before list could keep empty assets. Reconcile fresh list assets at render time
  by exact provider + match ID + unique team ID. No cross-provider ID fallback.
- Flags lacked the same-origin retry already used for crests.

## Player portrait safety and general eligibility

Every player may use the same lookup, not a handpicked photo registry. First use
only the exact athlete-ID-bound ESPN headshot supplied by its identity response.
The rel value 'default' also occurs on real headshots; reject placeholder PATHS,
not that relation. If absent/invalid/oversize, the independently matched Cricbuzz
profile may supply an image whose alt is exactly the published name (including
observed hyphenated slug form). Never take first page image, search thumbnail or
og:image: live og:image was identical for Kohli and Mandhana, so not identity-safe.

Every emitted portrait requires HTTPS GET200/image MIME/measured positive body
<=204800 bytes, no redirects or spoofed headers. Runtime evidence cached five
minutes; overall profile cache one hour. The build independently GET-validates
emitted sample portraits. Failures stay null and never erase valid profile text.
Fixtures never acquire live photos. Native Cricbuzz profile uses the same gate;
internal candidate field is removed before its response.

## Vercel evidence

Commit 35cc89811310d1ebb38ed62a61bb307ba9d22ce6, deployment
`dpl_5BrLWWKK5HnFzr4kRb93btZkEnhF`, READY. Candidate:
https://cricketapi-k6plv330x-ahmedtabish1000-gmailcoms-projects.vercel.app

Direct candidate ESPN profile HTTP responses now supply:
- /espn/player/300631 → static.cricbuzz.com/a/img/v1/i1/c847150/kusal-perera.jpg?d=low&p=gthumb
- /espn/player/597806 → static.cricbuzz.com/a/img/v1/i1/c1005070/smriti-mandhana.jpg?d=low&p=gthumb

Build measured evidence:
- Kohli ESPN original: HTTP200 image/png, read stopped at 212983 bytes (>200KB), rejected.
- Kohli labelled CB fallback: HTTP200 image/jpeg, 1995 bytes, accepted.
- Williamson published ESPN photo: HTTP200 image/png, 199753 bytes, accepted.

The production-before build audit found 33 distinct advertised image URLs, all
33 green, zero red/unknown/discovery failures; 186 null image references are
occurrences, NOT distinct teams. Null regional/club crest coverage is still a
source-coverage gap. No evidence permits filling it with country flags or random
logos. This patch fixes website transport/prop/lifecycle gaps, not universal
regional crest publication. West Indies API flag remains null, with the existing
user-approved local website flag unchanged.

## Tests/delivery

API 89 tests pass. Website typecheck, 209 tests/24 files and production build pass.
Added portrait identity/size/MIME/failure tests, CB labelled-image rejection,
website photo source tests, badge navigation/failure chain and late-list asset
identity reconciliation tests. These are automated component/contract tests,
not a live browser end-to-end claim.

Separate WEBSITE changed-files ZIP + checksum-verified PowerShell installer;
no website source committed/pushed into API. Website repository is cloned only
for inspection and local checks. PR15 is preview only; not merged/promoted.
