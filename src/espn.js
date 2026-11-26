// Public ESPN endpoints observed in scoreboard/header, league scoreboard,
// summary and standings responses. Recordings are for explicit offline tests only.
import { DATA_MODE, TTL } from './config.js';
import { fetchJson, UpstreamError } from './http.js';
import { cached } from './cache.js';
import { resolveFixture } from './fixtures.js';

const SITE = 'https://site.api.espn.com';
const WEB = 'https://site.web.api.espn.com';
const HEADER = `${SITE}/apis/personalized/v2/scoreboard/header?sport=cricket&region=us&lang=en&tz=UTC`;
const headers = { Accept: 'application/json', 'User-Agent': 'CricketAPI educational research' };
const text = (v) => v == null ? '' : String(v);
const timestamp = (v) => v ? Date.parse(v) || null : null;
const kinds = { in: 'live', post: 'recent', pre: 'upcoming' };

export function normalizeEspnEvent(event, league = {}) {
  const comp = event.competitions?.[0] || event;
  const status = comp.status?.type ? comp.status : event.fullStatus || event.status || {};
  const state = status.type?.state || (typeof event.status === 'string' ? event.status : '');
  const competitors = comp.competitors || [];
  const team = (c = {}) => {
    const t = c.team || c;
    return { id: text(t.id), name: text(t.displayName || t.name), short: text(t.abbreviation || t.name), imageUrl: t.logo || '' };
  };
  const team1 = team(competitors[0]);
  const team2 = team(competitors[1]);
  const scores = competitors.flatMap((c) => (c.linescores || [])
    // Non-batting mirrors have the opponent's overs and fictitious zero runs.
    .filter((i) => i.isBatting !== false && i.runs != null)
    .map((i) => ({ inningsId: i.period, team: team(c).short, score: `${i.runs}/${i.wickets ?? 0}`, overs: text(i.overs), declared: /declared/i.test(i.description || '') })));
  if (!scores.length) for (const c of competitors) if (c.score) scores.push({ team: team(c).short, score: text(c.score), overs: '' });
  const venue = comp.venue || event.venue || {};
  const leagueId = text(league.id || event.league?.id || event.links?.map((l) => l.href?.match(/series\/(\d+)/)?.[1]).find(Boolean));
  return {
    matchId: text(event.id), teams: `${team1.short} vs ${team2.short}`, team1, team2,
    series: { id: leagueId, name: text(league.name || event.league?.name) },
    category: kinds[state] || 'unknown', live: state === 'in', state,
    status: text(status.summary || status.longSummary || status.type?.detail || event.summary),
    stateTitle: text(status.type?.description), format: text(event.class?.generalClassCard),
    startDate: timestamp(event.date || event.startDate), endDate: timestamp(event.endDate),
    venue: { ground: text(venue.fullName || event.location), city: text(venue.address?.city), country: text(venue.address?.country) },
    scores: scores.sort((a,b) => (a.inningsId || 0) - (b.inningsId || 0)),
    playerOfTheMatch: (status.featuredAthletes || []).filter((a) => a.abbreviation === 'POTM').map((a) => a.athlete?.displayName || a.athlete?.name),
    upstream: event.links?.find((l) => l.rel?.includes('summary'))?.href || event.link || '',
    source: 'espn-site',
  };
}

export function normalizeEspnScoreboard(raw) {
  return (raw.events || []).map((e) => normalizeEspnEvent(e, raw.leagues?.[0]));
}

async function request(op, id, url, normalize, ttl = TTL.live) {
  if (DATA_MODE === 'fixtures') {
    const fx = resolveFixture(op, id);
    if (!fx) { const err = new UpstreamError(`no fixture recorded for ${op}`, { status: 404 }); err.code = 'NO_FIXTURE'; throw err; }
    return { data: normalize(fx.data), meta: { source: 'fixture', fixtureFile: fx.file, cached: false } };
  }
  // Normalized responses depend on the operation (live/recent/upcoming share
  // the same header URL). Never reuse a category-filtered result for another.
  return cached(`${op}:${id ?? ''}:${url}`, ttl, async () => {
    const { json } = await fetchJson(url, { headers, retries: 0 });
    return { data: normalize(json), meta: { source: 'live', upstream: url, fetchedAt: new Date().toISOString(), cached: false } };
  });
}

export async function fetchEspnHeader(kind) {
  return request(`espn.${kind}`, undefined, HEADER, (raw) => {
    const matches = raw.sports ? raw.sports.flatMap((s) => (s.leagues || []).flatMap((l) => (l.events || []).map((e) => normalizeEspnEvent(e,l)))) : normalizeEspnScoreboard(raw);
    return matches.filter((m) => !kind || m.category === kind);
  });
}
export const getEspnMatches = fetchEspnHeader;
export function getEspnSeries(league, date) {
  return request('espn.series', league, `${SITE}/apis/site/v2/sports/cricket/${league}/scoreboard${date ? `?dates=${encodeURIComponent(date)}` : ''}`, normalizeEspnScoreboard, TTL.series);
}
export async function getEspnMatch(league, id, date, squads = false) {
  if (squads) return request('espn.squads', id, `${WEB}/apis/site/v2/sports/cricket/${league}/summary?event=${id}&lang=en&region=in`, (raw) => ({ matchId: id, teams: raw.rosters || [] }), TTL.squads);
  const result = await getEspnSeries(league, date);
  const match = result.data.find((m) => m.matchId === id);
  if (!match) throw new UpstreamError('match not found in league scoreboard; supply date=YYYYMMDD for historical matches', { status: 404 });
  return { data: match, meta: result.meta };
}
export function getEspnStandings(league) {
  return request('espn.standings', league, `${SITE}/apis/v2/sports/cricket/${league}/standings`, (raw) => ({
    leagueId: league, season: raw.season || null,
    groups: (raw.children || []).map((g) => ({ name: g.name, entries: (g.standings?.entries || []).map((e) => ({ team: { id: e.team.id, name: e.team.displayName, short: e.team.abbreviation }, stats: Object.fromEntries((e.stats || []).filter((s) => s.value != null).map((s) => [s.name, s.value])) })) })),
  }), TTL.pointsTable);
}
