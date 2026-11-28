# Structured ESPN detail additions (review required)

The match detail route now requests an identity-checked ESPN summary in addition
to its existing scoreboard. Existing scoreboard IDs/scores and cache headers are
unchanged. Summary failure leaves the match available, with null additions and
`meta.source.detail.source=unavailable` (no stale or fabricated metadata).

- `toss: {winnerTeamId, choice: 'bat'|'field'} | null`: exact full team name in
  the single published `notes[type=toss]` text ending `, elected to bat/field
  first`. This is deterministic extraction from the provider's dedicated toss
  field, NOT commentary/result inference. Unmatched/ambiguous names stay null.
- `officials: {umpires: string[]|null, tvUmpire: string|null, referee:string|null}|null`:
  explicit `gameInfo.officials[].position.name` and displayName only. No inference
  from order. Unsupported roles stay unrepresented.
- `pitch: null`: no sanctioned structured pitch note observed. Venue address
  summary and weather are not pitch reports.
- ESPN squads `isAnnounced: true|null`: exactly 11 unique identified players,
  every raw row `starter === true`; unknown/provisional stays null, not false.
- Player role `Unknown`, blank and absent normalize to null. Published batting
  and bowling styles remain independent, never used to infer roles.
- No new headshotUrl/countryIso fields or images: observed summaries include a
  generic default-player-logo, which is NOT a verified player identity image.

Observed primary payloads:
https://site.web.api.espn.com/apis/site/v2/sports/cricket/1561006/summary?event=1561236&lang=en&region=in
https://site.web.api.espn.com/apis/site/v2/sports/cricket/1562333/summary?event=1562331&lang=en&region=in

1561236: published toss Pakistan-administered Kashmir Region, bat; umpires Asif
Farooq Awan and Rana Arshad; referee Inamullah Khan.
1562331: published toss Indonesia Women, field; umpires Nur Hijrah and Rudy
Ismandy; referee Edwin Seah. The provider now reports this fixture finished;
never label it a current live international.

Remote build `scripts/detail-evidence.mjs` logs DETAIL_SAMPLE full detail/squads
payloads, asserts no-store, real summary availability, IDs and squad invariants,
and logs DETAIL_EVIDENCE coverage/mergeReady. It discovers a live T20I by its
published format when available; absence is an explicit evidence gap. A green
transport/build alone does NOT authorize merge if fixture-class coverage is
incomplete. `detail-samples.json` is a build output, not a public API route.

Scope: ESPN adapter only. Other providers' unrelated shapes are not guessed.
Frontend consumers/ZIP are a separate follow-up after API evidence review;
no website source is included in this API repository.
