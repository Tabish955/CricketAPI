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

/** Match-specific statistics live on roster[].linescores[], not career totals.
 * Ignore nested per-over linescores: the parent already contains innings totals.
 */
export function normalizeEspnPlayerInnings(rosters = []) {
  const innings = new Map();
  for (const side of rosters) for (const player of side.roster || []) {
    for (const line of player.linescores || []) {
      const stats = Object.fromEntries((line.statistics?.categories || [])
        .flatMap((c) => c.stats || []).map((s) => [s.name, s.value]));
      const period = Number(stats.inningsNumber || line.period);
      if (!period || (!stats.batted && !stats.inningsBowled)) continue;
      if (!innings.has(period)) innings.set(period, { inningsId: period, batsmen: [], bowlers: [] });
      const inn = innings.get(period);
      const athlete = player.athlete || {};
      const base = { id: text(athlete.id), name: text(athlete.displayName || athlete.name), teamId: text(side.team?.id) };
      if (Number(stats.batted) > 0) {
        inn.team = text(side.team?.abbreviation || side.team?.displayName);
        inn.batsmen.push({ ...base, position: stats.battingPosition ?? null,
          runs: stats.runs ?? null, balls: stats.ballsFaced ?? null,
          fours: stats.fours ?? null, sixes: stats.sixes ?? null, strikeRate: stats.strikeRate ?? null,
          dismissal: line.statistics?.batting?.outDetails?.shortText || (Number(stats.notouts) > 0 ? 'not out' : ''),
          isBatting: !!line.statistics?.batting?.active,
        });
      }
      if (Number(stats.inningsBowled) > 0) inn.bowlers.push({ ...base,
        overs: text(stats.overs), maidens: stats.maidens ?? null, runs: stats.conceded ?? null,
        wickets: stats.wickets ?? null, economy: stats.economyRate ?? null,
        wides: stats.wides ?? null, noBalls: stats.noballs ?? null,
      });
    }
  }
  return [...innings.values()].sort((a,b) => a.inningsId - b.inningsId)
    .map((i) => ({ ...i, batsmen: i.batsmen.sort((a,b) => (a.position ?? 100) - (b.position ?? 100)) }));
}

export async function getEspnScorecard(league, id, date) {
  // Summary and scoreboard have independent coverage. Preserve totals if the
  // summary fails, while explicitly reporting the unavailable player statistics.
  const detail = await getEspnMatch(league, id, date);
  let summary;
  try { summary = await getEspnMatch(league, id, date, true); }
  catch (err) {
    return { data: { matchId: id, innings: detail.data.scores, coverage: 'innings totals only', warnings: [err.message] }, meta: detail.meta };
  }
  const rows = normalizeEspnPlayerInnings(summary.data.teams);
  const totals = detail.data.scores;
  const innings = totals.map((total) => ({ ...total,
    batsmen: rows.find((i) => i.inningsId === total.inningsId)?.batsmen || [],
    bowlers: rows.find((i) => i.inningsId === total.inningsId)?.bowlers || [],
  }));
  return { data: { matchId: id, innings,
    coverage: rows.length ? 'innings totals and available player statistics' : 'innings totals only',
  }, meta: { ...detail.meta, playerStatistics: summary.meta } };
}

export function normalizeEspnCommentary(raw) {
  if (!raw.commentary || !Array.isArray(raw.commentary.items)) throw new UpstreamError('ESPN commentary payload missing');
  const c = raw.commentary;
  return {
    page: c.pageIndex, pageSize: c.pageSize, pageCount: c.pageCount, total: c.count,
    commentary: c.items.map((p) => ({
      id: text(p.id), inningsId: p.innings?.number ?? p.period ?? null,
      over: p.over?.actual ?? p.over?.overs ?? null, ball: p.over?.ball ?? null,
      event: text(p.playType?.description), text: text(p.text || p.shortText),
      runs: p.scoreValue ?? null, batsman: text(p.batsman?.athlete?.displayName),
      bowler: text(p.bowler?.athlete?.displayName),
      // In this feed totalRuns is the delivery contribution; runs is cumulative.
      score: p.innings?.runs != null ? `${p.innings.runs}/${p.innings.wickets ?? 0}` : null,
      wicket: !!p.dismissal?.dismissal,
    })),
  };
}
export function getEspnCommentary(league, id, page = 1) {
  return request('espn.commentary', id,
    `${WEB}/apis/site/v2/sports/cricket/${league}/playbyplay?event=${id}&page=${page}`,
    normalizeEspnCommentary, TTL.commentary);
}
