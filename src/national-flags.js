// Explicit national identities only. No suffix stripping, substring or club inference.
const countries = {
  bd: ['Bangladesh','BAN'], pk: ['Pakistan','PAK'], in: ['India','IND'],
  zw: ['Zimbabwe','ZIM'], ie: ['Ireland','IRE'], lk: ['Sri Lanka','SL'],
  au: ['Australia','AUS'], gb: ['England','ENG'], nz: ['New Zealand','NZ'],
  za: ['South Africa','SA'], af: ['Afghanistan','AFG'], ae: ['United Arab Emirates','UAE'],
  na: ['Namibia','NAM'], np: ['Nepal','NEP'], nl: ['Netherlands','NED'],
  ca: ['Canada','CAN'], us: ['United States of America','USA'], om: ['Oman','OMA'],
  sc: ['Seychelles'], ke: ['Kenya','KEN'], ug: ['Uganda','UGA'],
  pg: ['Papua New Guinea','PNG'], hk: ['Hong Kong','HKG'], my: ['Malaysia','MAL'],
  sg: ['Singapore','SGP'], bm: ['Bermuda','BER'], je: ['Jersey','JER'],
};
const identities = new Map();
for (const [iso, names] of Object.entries(countries)) for (const name of names) {
  for (const suffix of ['', ' A', ' XI', ' Women', ' Under-19s', ' Under-19s Women']) identities.set((name+suffix).toLowerCase(),iso);
  for (const suffix of ['-A','-XI','-W','-U19']) identities.set((name+suffix).toLowerCase(),iso);
}
// West Indies has no single ISO country flag; Scotland has no ISO3166-1 code.
export function nationalFlag(team) {
  // Full provider name takes precedence: a club short code must not become a country.
  const identity = team.name || team.short;
  const iso = identities.get(String(identity || '').trim().toLowerCase());
  return iso ? `https://flagcdn.com/w40/${iso}.png` : null;
}
export const flagCandidates = [...new Set([...identities.values()])].map(iso=>`https://flagcdn.com/w40/${iso}.png`);
