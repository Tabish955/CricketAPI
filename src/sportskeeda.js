// Additional public HTML standings source. Never cross-map provider IDs or
// silently treat a dynamically titled table as a verified current-season table.
import { load } from 'cheerio';
import { fetchText, UpstreamError } from './http.js';
import { cached } from './cache.js';
import { DATA_MODE, TTL } from './config.js';

const clean = (s) => s.replace(/\s+/g, ' ').trim();
const numeric = (s) => /^[-+]?\d+(?:\.\d+)?$/.test(s.trim()) ? Number(s) : null;
const column = (s) => ({ pos:'rank', position:'rank', teams:'team', team:'team', p:'matchesPlayed', played:'matchesPlayed', w:'matchesWon', l:'matchesLost', nr:'noresult', 'n/r':'noresult', pts:'matchPoints', points:'matchPoints', nrr:'netrr', t:'matchesTied', d:'matchesDraw' })[s.toLowerCase().replace(/\s+/g,'')];
export function parseSportskeedaStandings(html, slug) {
  const $ = load(html);
  const groups = [];
  let group = '';
  $('h2,h3,h4,table').each((_, el) => {
    const node = $(el);
    if (el.tagName !== 'table') {
      if (/^(?:(?:elite[, ]*)?group\s+[a-z0-9]+|plate(?: group)?)$/i.test(clean(node.text()))) group = clean(node.text());
      return;
    }
    const rows = node.find('tr').toArray();
    const headerIndex = rows.findIndex((r) => {
      const keys = $(r).find('th,td').toArray().map((c) => column(clean($(c).text())));
      return keys.includes('team') && keys.includes('matchPoints') && keys.includes('matchesPlayed');
    });
    if (headerIndex < 0) return;
    const keys = $(rows[headerIndex]).find('th,td').toArray().map((c) => column(clean($(c).text())));
    const entries = [];
    for (const row of rows.slice(headerIndex + 1)) {
      const cells = $(row).find('td').toArray();
      if (cells.length !== keys.length) continue;
      const teamCell = $(cells[keys.indexOf('team')]);
      const name = clean(teamCell.text());
      if (!name) continue;
      const href = teamCell.find('a[href*="/team/"]').attr('href') || '';
      const id = href.match(/\/team\/([a-z0-9-]+)(?:[/?#]|$)/i)?.[1] || '';
      const image = teamCell.find('img').attr('data-src') || teamCell.find('img').attr('src') || '';
      const imageUrl = /^https:\/\/staticg\.sportskeeda\.com\//.test(image) ? image : '';
      const stats = {};
      keys.forEach((key, i) => { if (key && key !== 'team') stats[key] = numeric(clean($(cells[i]).text())); });
      if (stats.matchesPlayed == null || stats.matchPoints == null) continue;
      entries.push({ team: { id, name, short: '', imageUrl }, stats });
    }
    if (entries.length) groups.push({ name: group, entries });
  });
  if (!groups.length) throw new UpstreamError('Sportskeeda standings table missing or markup changed');
  return { seriesSlug: slug, provider: 'sportskeeda', title: clean($('h1').first().text()),
    season: null, seasonVerified: false,
    warnings: ['Dynamic source page: season is not independently verified. Do not merge with another provider or label as current without checking the source.'], groups };
}
export function getSportskeedaStandings(slug) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 100) throw new UpstreamError('invalid Sportskeeda series slug', { status: 400 });
  if (DATA_MODE === 'fixtures') throw new UpstreamError('No recorded Sportskeeda fixture; live fetch disabled in fixtures mode', { status: 404 });
  const url = `https://www.sportskeeda.com/go/${slug}/points-table`;
  return cached(`sportskeeda.standings:${slug}`, TTL.pointsTable, async () => {
    const { text } = await fetchText(url, { headers: { Accept: 'text/html', 'User-Agent': 'CricketAPI educational research' }, retries: 0 });
    return { data: parseSportskeedaStandings(text, slug), meta: { source: 'live', upstream: url, fetchedAt: new Date().toISOString(), cached: false } };
  });
}
