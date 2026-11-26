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
  return request('espn.series', league, `${SITE}/apis/site/v2/sports/cricket/${league}/scoreboard${date ? `?dates=${encodeURIComponent(date)}` : ''}`, normalizeEspnScoreboard, TTL.liveScore);
}
export async function getEspnMatch(league, id, date, squads = false) {
  if (squads) return getEspnRosters(league, id);
  const result = await getEspnSeries(league, date);
  const match = result.data.find((m) => m.matchId === id);
  if (!match) throw new UpstreamError('match not found in league scoreboard; supply date=YYYYMMDD for historical matches', { status: 404 });
  return { data: match, meta: result.meta };
}
export function normalizeEspnStandings(raw, league) {
  const groups = [];
  function visit(node) {
    if (Array.isArray(node.standings?.entries)) groups.push({
      id: text(node.id), name: text(node.name || node.standings.displayName),
      season: node.standings.season ?? null,
      entries: node.standings.entries.map((e) => ({
        team: { id: text(e.team?.id), name: text(e.team?.displayName), short: text(e.team?.abbreviation), imageUrl: e.team?.logos?.[0]?.href || '' },
        stats: Object.fromEntries((e.stats || []).filter((s) => s.value != null && s.value !== '').map((s) => [s.name, s.value])),
        displayStats: Object.fromEntries((e.stats || []).filter((s) => s.displayValue != null).map((s) => [s.name, s.displayValue])),
      })),
    });
    for (const child of node.children || []) visit(child);
  }
  visit(raw);
  return { leagueId: league, name: text(raw.name), season: raw.season || null, groups };
}
export function getEspnStandings(league) {
  return request('espn.standings', league, `${SITE}/apis/v2/sports/cricket/${league}/standings`,
    (raw) => normalizeEspnStandings(raw, league), TTL.pointsTable);
}

const numberOrNull = (v) => v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v);

/** Observed summary.header.competitions[].competitors[].linescores[] fields.
 * Never infer missing sections from a partial commentary page or bowling sums.
 */
export function normalizeEspnInningsDetails(raw) {
  return (raw.header?.competitions || []).flatMap((c) => (c.competitors || []).flatMap((side) =>
    (side.linescores || []).filter((line) => line.isBatting === true).map((line) => {
      const stats = Object.fromEntries((line.statistics?.categories || []).flatMap((c) => c.stats || []).map((s) => [s.name, s.value]));
      const extras = { total: numberOrNull(stats.extras), byes: numberOrNull(stats.byes),
        legByes: numberOrNull(stats.legbyes), wides: numberOrNull(stats.wides),
        noBalls: numberOrNull(stats.noballs), penalties: numberOrNull(stats.penalties) };
      const endpoint = (v) => v ? { overs: text(v.overs), runs: numberOrNull(v.runs), wickets: numberOrNull(v.wickets) } : null;
      return { inningsId: Number(line.period), teamId: text(side.team?.id || side.id),
        extras: Object.values(extras).some((v) => v !== null) ? extras : null,
        fallOfWickets: Array.isArray(line.fow) ? line.fow.map((w) => ({
          wicketNumber: numberOrNull(w.wicketNumber), overs: text(w.wicketOver),
          runs: numberOrNull(w.runs), type: text(w.fowType),
          batsman: { id: text(w.athlete?.id), name: text(w.athlete?.displayName || w.athlete?.name) },
          batsmanRuns: numberOrNull(w.runsScored), ballsFaced: numberOrNull(w.ballsFaced),
        })) : null,
        partnerships: Array.isArray(line.partnerships) ? line.partnerships.map((p) => ({
          wicketNumber: numberOrNull(p.wicketNumber), type: text(p.fowType),
          runs: numberOrNull(p.runs), overs: text(p.overs), runRate: numberOrNull(p.runRate),
          start: endpoint(p.start), end: endpoint(p.end),
          batsmen: (p.batsmen || []).map((b) => ({ id: text(b.athlete?.id), name: text(b.athlete?.displayName || b.athlete?.name), runs: numberOrNull(b.runs), balls: numberOrNull(b.balls) })),
        })) : null,
      };
    })));
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
  try { summary = await getEspnRosters(league, id, true); }
  catch (err) {
    return { data: { matchId: id, innings: detail.data.scores.map((i) => ({ ...i, extras: null, fallOfWickets: null, partnerships: null })), coverage: 'innings totals only', warnings: [err.message] }, meta: detail.meta };
  }
  const rows = normalizeEspnPlayerInnings(summary.data.teams);
  const totals = detail.data.scores;
  const sections = summary.data.inningsDetails || [];
  const innings = totals.map((total) => ({ ...total,
    ...(sections.find((i) => i.inningsId === total.inningsId) || { extras: null, fallOfWickets: null, partnerships: null }),
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

export function normalizeEspnSquads(rosters = []) {
  return rosters.map((side) => ({
    teamId: text(side.team?.id), teamName: text(side.team?.displayName),
    players: (side.roster || []).map((p) => ({
      id: text(p.athlete?.id), name: text(p.athlete?.displayName || p.athlete?.name),
      role: text(p.position?.name || p.athlete?.position?.name),
      isCaptain: !!p.captain, isStarter: !!p.starter,
      battingStyle: text(p.athlete?.style?.find((s) => s.type === 'batting')?.description),
      bowlingStyle: text(p.athlete?.style?.find((s) => s.type === 'bowling')?.description),
    })),
  }));
}


function getEspnRosters(league, id, statistics = false) {
  // Playing squads change slowly; their embedded live stats do not. Keep
  // separate cache entries/TTLs so squads cannot freeze a live scorecard.
  return request(statistics ? 'espn.playerStats' : 'espn.squads', id,
    `${WEB}/apis/site/v2/sports/cricket/${league}/summary?event=${id}&lang=en&region=in`,
    (raw) => {
      if (!Array.isArray(raw.rosters) && !(statistics && raw.header?.competitions)) throw new UpstreamError('ESPN summary rosters missing');
      return { matchId: id, teams: raw.rosters || [], inningsDetails: statistics ? normalizeEspnInningsDetails(raw) : undefined };
    }, statistics ? TTL.liveScore : TTL.squads);
}
