// Independent provider: public Angular SSR schedule. No tokens/private APIs.
// Selectors observed in cu-sanjay/IPL-2026-API-Free; runtime shape is validated.
import { load } from 'cheerio';
import { fetchText, UpstreamError } from './http.js';
import { cached } from './cache.js';
import { CRICBUZZ_HTML_HEADERS, DATA_MODE, TTL } from './config.js';
const URL = 'https://crex.com/schedule';
const clean = (v) => String(v || '').replace(/\s+/g, ' ').trim();
export function parseCrexSchedule(html) {
  const $ = load(html);
  let cards = $('app-match-card');
  if (!cards.length) cards = $('div.match-card-container');
  const matches = new Map();
  for (const el of cards) {
    const card = $(el);
    const href = card.find('a.match-card-wrapper, a[href*="/cricket-live-score/"]').first().attr('href');
    if (!href) continue;
    let upstream;
    try { upstream = new globalThis.URL(href, URL); } catch { continue; }
    if (upstream.hostname !== 'crex.com' || upstream.protocol !== 'https:') continue;
    const matchId = upstream.pathname.match(/match-updates-([a-z0-9]+)\/?$/i)?.[1];
    if (!matchId) continue;
    const teams = card.find('div.team-info').toArray().map((t) => ({
      name: clean($(t).find('span.team-name').text()),
      score: clean($(t).find('span.team-score').text()),
      overs: clean($(t).find('span.total-overs').text()),
    })).filter((t) => t.name);
    if (teams.length !== 2) continue;
    const result = card.find('div.result');
    const note = clean(result.find('div.notes, span.result-text').first().text());
    const start = clean(card.find('div.start-text, span.start-text').first().text());
    const category = /\b(won|drawn|tied|abandoned|no result)\b/i.test(note) ? 'recent'
      : result.hasClass('live') || card.find('span.liveTag').length ? 'live' : start ? 'upcoming' : null;
    // Unknown markup/status is not a scheduled match by default.
    if (!category) continue;
    const team = (t) => ({ id: '', name: t.name, short: t.name });
    matches.set(matchId, {
      matchId, teams: `${teams[0].name} vs ${teams[1].name}`, team1: team(teams[0]), team2: team(teams[1]),
      scores: teams.filter((t) => /\d/.test(t.score)).map((t) => ({ team: t.name, score: t.score, overs: t.overs })),
      status: note || (category === 'live' ? 'Live' : start), category, live: category === 'live', state: category,
      series: { id: '', name: '' }, venue: { ground: '', city: '', country: '' },
      startDate: null, endDate: null, startTimeText: start,
      upstream: upstream.href, source: 'crex',
    });
  }
  if (!matches.size) {
    const sample = $('a[href*="match-updates-"]').first();
    const shape = { title: $('title').text(), cards: cards.length,
      sample: sample.length ? $.html(sample).slice(0, 4500) : 'no match anchors' };
    throw new UpstreamError(`CREX schedule markup missing or unsupported; no matches extracted; structure=${JSON.stringify(shape)}`, { url: URL });
  }
  return [...matches.values()];
}
export async function getCrexMatches(kind) {
  if (DATA_MODE === 'fixtures') { const e = new UpstreamError('no CREX recording; live provider only', { status: 404 }); e.code = 'NO_FIXTURE'; throw e; }
  const r = await cached('crex:schedule', TTL.live, async () => {
    const { text } = await fetchText(URL, { headers: CRICBUZZ_HTML_HEADERS, retries: 0 });
    return { data: parseCrexSchedule(text), meta: { source: 'live', upstream: URL, fetchedAt: new Date().toISOString(), cached: false } };
  });
  return { ...r, data: r.data.filter((m) => !kind || m.category === kind) };
}
