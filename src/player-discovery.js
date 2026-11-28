import { fetchJson, UpstreamError } from './http.js';
import { cached } from './cache.js';

export const normalizedPlayerName = (s) => typeof s === 'string'
  ? s.normalize('NFKC').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase() : '';
export const cricbuzzPlayerUrl = (id) => `https://www.cricbuzz.com/profiles/${id}/player`;

// Public web autocomplete, observed in the site's current client and verified
// against live duplicate-name and women's-player responses. No key/proxy bypass.
export async function searchCricbuzzPlayers(query) {
  const url = `https://www.cricbuzz.com/api/player-search/${encodeURIComponent(query)}`;
  return cached(`cb:autocomplete:${normalizedPlayerName(query)}`, 3600, async () => {
    const { json } = await fetchJson(url, { retries: 0 });
    if (!json || typeof json !== 'object' || Array.isArray(json)
      || (json.player != null && !Array.isArray(json.player))
      || (!Array.isArray(json.player) && typeof json.category !== 'string')
      || (json.player?.length || 0) > 500) throw new UpstreamError('invalid player-search response');
    // A no-hit response is {category: query}, with no player property.
    return { data: json.player || [], meta: { source: 'live', upstream: url, cached: false } };
  });
}

/** Eligible for every ESPN identity, never a manually enumerated ID list.
 * Require one unique exact published name + full DOB candidate. Independently
 * recheck the actual profile before importing any biography/statistics.
 */
export async function discoverCricbuzzProfile(player, search = searchCricbuzzPlayers) {
  const names = [...new Map([player.shortName, player.name].filter((n) => typeof n === 'string' && n.trim().length >= 2 && n.trim().length <= 120)
    .map((n) => [normalizedPlayerName(n), n.trim()])).values()];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(player.personalInfo?.birthDate || '') || !names.length) return { status: 'identity_unavailable' };
  const aliases = new Set(names.map(normalizedPlayerName));
  const results = await Promise.all(names.map((name) => search(name)));
  const hits = new Map();
  for (const result of results) {
    if (!Array.isArray(result.data)) throw new UpstreamError('invalid player-search rows');
    for (const p of result.data) {
      if (!/^[1-9]\d{0,11}$/.test(String(p?.id || '')) || !aliases.has(normalizedPlayerName(p.name)) || p.dob !== player.personalInfo.birthDate) continue;
      hits.set(String(p.id), p);
    }
  }
  if (hits.size !== 1) return { status: hits.size ? 'ambiguous' : 'no_match' };
  const [id, candidate] = [...hits][0];
  return { status: 'matched', link: { cricbuzzId: id, url: cricbuzzPlayerUrl(id), names: [...names, candidate.name], born: candidate.dob,
    searchUrls: results.map((r) => r.meta?.upstream).filter(Boolean) } };
}
