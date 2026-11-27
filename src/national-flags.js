// Explicit national identities only. No suffix stripping, substring or club inference.
export const countries = {
  bd: ['Bangladesh','BAN'], pk: ['Pakistan','PAK'], in: ['India','IND'],
  zw: ['Zimbabwe','ZIM'], ie: ['Ireland','IRE'], lk: ['Sri Lanka','SL'],
  au: ['Australia','AUS'], 'gb-eng': ['England','ENG'], 'gb-sct': ['Scotland','SCO'], 'gb-wls': ['Wales','WAL'], nz: ['New Zealand','NZ'],
  za: ['South Africa','SA'], af: ['Afghanistan','AFG'], ae: ['United Arab Emirates','UAE'],
  na: ['Namibia','NAM'], np: ['Nepal','NEP'], nl: ['Netherlands','NED'],
  ca: ['Canada','CAN'], us: ['United States of America','USA'], om: ['Oman','OMA'],
  id: ['Indonesia','IDN'], th: ['Thailand','THA'], bt: ['Bhutan','BHU'],
  mv: ['Maldives','MDV'], bh: ['Bahrain','BHR'], kw: ['Kuwait','KUW'],
  qa: ['Qatar','QAT'], sa: ['Saudi Arabia','KSA'], cn: ['China','CHN'],
  jp: ['Japan','JPN'], kr: ['South Korea','KOR'], mn: ['Mongolia','MGL'],
  kh: ['Cambodia','CAM'], mm: ['Myanmar','MYA'], ph: ['Philippines','PHI'],
  vu: ['Vanuatu','VAN'], fj: ['Fiji','FIJ'], ws: ['Samoa','SAM'],
  de: ['Germany','GER'], it: ['Italy','ITA'], fr: ['France','FRA'],
  es: ['Spain','ESP'], pt: ['Portugal','POR'], dk: ['Denmark','DEN'],
  no: ['Norway','NOR'], se: ['Sweden','SWE'], fi: ['Finland','FIN'],
  at: ['Austria','AUT'], be: ['Belgium','BEL'], ch: ['Switzerland','SUI'],
  cz: ['Czech Republic','Czechia','CZE'], ro: ['Romania','ROM'], hu: ['Hungary','HUN'],
  gr: ['Greece','GRE'], cy: ['Cyprus','CYP'], mt: ['Malta','MLT'],
  ee: ['Estonia','EST'], lu: ['Luxembourg','LUX'], gi: ['Gibraltar','GIB'],
  gg: ['Guernsey','GSY'], ar: ['Argentina','ARG'], br: ['Brazil','BRA'],
  cl: ['Chile','CHI'], mx: ['Mexico','MEX'], bz: ['Belize','BIZ'],
  cr: ['Costa Rica','CRC'], pa: ['Panama','PAN'], pe: ['Peru','PER'],
  bs: ['Bahamas','BAH'], ky: ['Cayman Islands','CAY'], tc: ['Turks and Caicos Islands','TCA'],
  rw: ['Rwanda','RWA'], tz: ['Tanzania','TAN'], ng: ['Nigeria','NGA'],
  gh: ['Ghana','GHA'], bw: ['Botswana','BOT'], mw: ['Malawi','MAW'],
  zm: ['Zambia','ZAM'], mz: ['Mozambique','MOZ'], sl: ['Sierra Leone','SLE'],
  cm: ['Cameroon','CMR'], gm: ['Gambia','GAM'], sz: ['Eswatini','Swaziland','SWZ'],
  ls: ['Lesotho','LES'], mu: ['Mauritius','MRI'],
  sc: ['Seychelles'], ke: ['Kenya','KEN'], ug: ['Uganda','UGA'],
  pg: ['Papua New Guinea','PNG'], hk: ['Hong Kong','HKG'], my: ['Malaysia','MAL'],
  sg: ['Singapore','SGP'], bm: ['Bermuda','BER'], je: ['Jersey','JER'],
};
const identities = new Map();
for (const [iso, names] of Object.entries(countries)) for (const name of names) {
  for (const suffix of ['', ' A', ' XI', ' Women', ' Women A', ' A Women', ' Women XI', ' Under-19s', ' Under-19', ' U19', ' Under-19s Women', ' Women Under-19s', ' Women Under-19', ' Women U19']) identities.set((name+suffix).toLowerCase(),iso);
  for (const suffix of ['-A','-XI','-W','-U19','-W-A','-A-W','-W-XI','-U19-W','-W-U19','-U19s']) identities.set((name+suffix).toLowerCase(),iso);
}
// GB constituent sides use explicit ISO3166-2 subdivision flags, not the UK flag.
// West Indies has no single ISO country flag; never substitute a member country.
export function nationalFlag(team) {
  // Full provider name takes precedence: a club short code must not become a country.
  const identity = team.name || team.short;
  const iso = identities.get(String(identity || '').trim().toLowerCase());
  return iso ? `https://flagcdn.com/w40/${iso}.png` : null;
}
export const flagCandidates = [...new Set([...identities.values()])].map(iso=>`https://flagcdn.com/w40/${iso}.png`);

// Diagnostic only: never add a reason field to public API payloads.
export function flagNullReason(team) {
  const name=String(team.name || team.short || '').trim();
  if (/^(West Indies|WI)(?:$|[ -])/i.test(name)) return 'West Indies: multi-country side; no ISO country substitution';
  if (nationalFlag(team)) return 'Mapped national identity; flag transport validation failed or URL missing from build allowlist';
  if (/\b(Region|Regional|Province|Provincial)\b/i.test(name)) return 'Regional side; no national flag identity';
  return 'No registered national identity (club/county or unmapped name); no inferred flag';
}
