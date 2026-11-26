import { getCrexMatches } from './crex.js';
import { getEspnMatches, getEspnSeries, getEspnMatch, getEspnStandings, getEspnScorecard, getEspnCommentary, normalizeEspnSquads } from './espn.js';
// CricketAPI — zero-dependency Node HTTP server.
// Route surface mirrors the reference CricBuzz proxy API and adds the extra
// upstreams we reverse-engineered (legacy mapps API, ESPNcricinfo).

import http from 'node:http';
import { PORT, DATA_MODE, IMG_ALLOWLIST, IMG_MAX_BYTES, UPSTREAM_TIMEOUT_MS } from './config.js';
import {
  getCricbuzzMatches,
  getCbziosLive,
  getCbziosMatchDetail,
  getCbziosScorecard,
  getCbziosSquads,
  getCommentary,
  getCricinfoList,
  getCricinfoMatch,
  getModernMatchDetail,
  getPlayerProfile,
  getPointsTable,
  getScorecard,
  getSeriesMatches,
  getSquads,
  searchPlayers,
} from './providers.js';
import { normalizeCricinfoList } from './normalize.js';
import { fixtureIds } from './fixtures.js';
import { UpstreamError } from './http.js';

const OWN = 'CricketAPI (educational; local reverse-engineering study)';

function send(res, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'X-Owner': OWN,
    ...extraHeaders,
  });
  res.end(payload);
}

function fail(res, status, error, extra = {}) {
  send(res, status, {
    success: false,
    error: typeof error === 'string' ? { message: error } : error,
    ...extra,
  });
}

function baseUrl(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`;
  const proto = req.headers['x-forwarded-proto'] || 'http';
  return `${proto}://${host}`;
}

function linkSet(origin, matchId, match) {
  if (match?.source === 'crex') return { detail: match.upstream, upstream: match.upstream };
  if (match?.source === 'espn-site') {
    const date = match.startDate ? new Date(match.startDate).toISOString().slice(0,10).replaceAll('-', '') : '';
    const query = `?league=${encodeURIComponent(match.series.id)}&date=${date}`;
    const base = `${origin}/espn/match/${matchId}`;
    return { detail: base + query, scorecard: base + '/scorecard' + query, commentary: base + '/commentary' + query, squads: base + '/squads' + query, upstream: match.upstream };
  }
  if (match?.source === 'espncricinfo') return { detail: `${origin}/cricinfo/match/${matchId}?seriesId=${encodeURIComponent(match.series.id)}` };
  return {
    detail: `${origin}/cb/match/${matchId}`,
    scorecard: `${origin}/cb/match/${matchId}/scorecard`,
    commentary: `${origin}/cb/match/${matchId}/commentary`,
    squads: `${origin}/cb/match/${matchId}/squads`,
    source: `${origin}/cb/match/${matchId}`,
    upstream: `https://www.cricbuzz.com/live-cricket-scores/${matchId}`,
  };
}

/** Shape a normalized match for the /cb/live-style envelope. */
function presentMatch(m, origin) {
  return {
    matchId: m.matchId,
    teams: m.teams,
    scores: m.scores,
    status: m.status,
    live: m.live,
    category: m.category,
    series: m.series?.name || '',
    seriesId: m.series?.id || '',
    format: m.format || '',
    state: m.state || '',
    stateTitle: m.stateTitle || '',
    venue: m.venue || null,
    startDate: m.startDate,
    endDate: m.endDate,
    team1: m.team1,
    team2: m.team2,
    ...(m.batsman ? { batsman: m.batsman, bowler: m.bowler } : {}),
    ...linkSet(origin, m.matchId, m),
    source: m.source,
  };
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

async function handleCbList(req, res, kind, origin, q) {
  // Prefer the modern API; merge legacy live feed when present.
  const primary = await getCricbuzzMatches(kind);
  let matches = primary.data;
  let secondary = null;
  if (kind === 'live' && primary.meta.source === 'fixture') {
    try {
      secondary = await getCbziosLive();
    } catch {
      // legacy feed is optional
    }
  }

  const byId = new Map(matches.map((m) => [m.matchId, m]));
  if (secondary && (primary.meta.source === 'fixture' || secondary.meta.source === 'live')) {
    for (const m of secondary.data) {
      if (!byId.has(m.matchId)) byId.set(m.matchId, m);
    }
  }

  let list = [...byId.values()];
  if (q) {
    const needle = q.toLowerCase();
    list = list.filter(
      (m) =>
        m.teams.toLowerCase().includes(needle) ||
        m.team1.name.toLowerCase().includes(needle) ||
        m.team2.name.toLowerCase().includes(needle) ||
        m.team1.short.toLowerCase() === needle ||
        m.team2.short.toLowerCase() === needle ||
        m.series.name.toLowerCase().includes(needle) ||
        m.matchId === q
    );
  }

  // Sort: live first, then by start date desc.
  list.sort((a, b) => {
    if (a.live !== b.live) return a.live ? -1 : 1;
    return (b.startDate || 0) - (a.startDate || 0);
  });

  send(res, 200, {
    success: true,
    result: {
      found: list.length > 0,
      count: list.length,
      matches: list.map((m) => presentMatch(m, origin)),
    },
    meta: {
      dataMode: DATA_MODE,
      primary: primary.meta,
      legacy: secondary ? secondary.meta : null,
    },
  });
}

async function handleSearch(req, res, origin, q) {
  if (!q) return fail(res, 400, { message: 'missing query parameter q' });
  const [live, recent, upcoming] = await Promise.allSettled([
    getCricbuzzMatches('live'),
    getCricbuzzMatches('recent'),
    getCricbuzzMatches('upcoming'),
  ]);
  const pool = [];
  for (const r of [live, recent, upcoming]) {
    if (r.status === 'fulfilled') pool.push(...r.value.data);
  }
  const needle = q.toLowerCase();
  const hits = pool.filter(
    (m) =>
      m.teams.toLowerCase().includes(needle) ||
      m.team1.short.toLowerCase() === needle ||
      m.team2.short.toLowerCase() === needle ||
      m.team1.name.toLowerCase().includes(needle) ||
      m.team2.name.toLowerCase().includes(needle) ||
      m.series.name.toLowerCase().includes(needle) ||
      m.matchId === q
  );
  const seen = new Set();
  const matches = hits.filter((m) => (seen.has(m.matchId) ? false : (seen.add(m.matchId), true)));
  send(res, 200, {
    success: true,
    query: q,
    result: {
      found: matches.length > 0,
      count: matches.length,
      matches: matches.map((m) => ({
        matchId: m.matchId,
        teams: m.teams,
        status: m.status,
        live: m.live,
        detail: linkSet(origin, m.matchId, m).detail,
        series: m.series?.name || '',
      })),
    },
    meta: { dataMode: DATA_MODE, sourcesFetched: [live, recent, upcoming].map((r) => r.status) },
  });
}

async function handleMatchDetail(req, res, origin, matchId, q) {
  const source = q.get('source') || 'auto'; // auto | modern | legacy
  let detail = null;
  let meta = null;
  const errors = [];

  if (source !== 'legacy') {
    try {
      const r = await getModernMatchDetail(matchId);
      detail = r.data;
      meta = r.meta;
    } catch (err) {
      errors.push({ source: 'modern', message: err.message, status: err.status || 0 });
    }
  }
  if ((!detail || source === 'legacy') && source !== 'modern') {
    try {
      const r = await getCbziosMatchDetail(matchId);
      if (!detail) {
        detail = r.data;
        meta = r.meta;
      }
    } catch (err) {
      errors.push({ source: 'legacy', message: err.message, status: err.status || 0 });
    }
  }

  if (!detail) {
    return fail(res, 502, { message: 'all match-detail sources failed', upstreamErrors: errors });
  }

  send(res, 200, {
    success: true,
    result: { found: true, match: { ...detail, ...linkSet(origin, matchId) } },
    meta: { dataMode: DATA_MODE, source: meta, errors: errors.length ? errors : undefined },
  });
}

async function handleScorecard(req, res, matchId, q) {
  const source = q.get('source') || 'modern'; // modern | legacy
  const fn = source === 'legacy' ? getCbziosScorecard : getScorecard;
  try {
    const { data, meta } = await fn(matchId);
    if (!data.innings?.length) {
      return fail(res, 404, {
        message: 'scorecard not found for match',
        matchId,
        meta,
      });
    }
    send(res, 200, {
      success: true,
      result: { found: true, matchId, scorecard: data },
      meta: { dataMode: DATA_MODE, source: meta },
    });
  } catch (err) {
    statusFor(res, err, 'scorecard fetch failed');
  }
}

async function handleCommentary(req, res, matchId, q) {
  const page = Number(q.get('page') || 0);
  try {
    const { data, meta } = await getCommentary(matchId, page);
    send(res, 200, {
      success: true,
      result: {
        found: data.lines.length > 0,
        matchId,
        page,
        count: data.lines.length,
        commentary: data.lines,
        extras: data.extras,
      },
      meta: { dataMode: DATA_MODE, source: meta },
    });
  } catch (err) {
    statusFor(res, err, 'commentary fetch failed');
  }
}

async function handleSquads(req, res, matchId, q) {
  const source = q.get('source') || 'auto';
  const attempts = [];
  if (source !== 'legacy') attempts.push(['modern', getSquads]);
  if (source !== 'modern') attempts.push(['legacy', getCbziosSquads]);
  const errors = [];
  for (const [name, fn] of attempts) {
    try {
      const { data, meta } = await fn(matchId);
      if (data.teams?.length) {
        return send(res, 200, {
          success: true,
          result: { found: true, matchId, teams: data.teams },
          meta: { dataMode: DATA_MODE, source: meta, via: name },
        });
      }
      errors.push({ source: name, message: 'empty squads' });
    } catch (err) {
      errors.push({ source: name, message: err.message, status: err.status || 0 });
    }
  }
  fail(res, 502, { message: 'all squad sources failed', upstreamErrors: errors });
}

async function handlePlayerByName(req, res, q) {
  const name = q.get('q') || q.get('name') || '';
  if (!name) return fail(res, 400, { message: 'missing query parameter q' });
  try {
    const { data, meta } = await searchPlayers(name);
    const first = data.players[0];
    if (!first) {
      return send(res, 200, {
        success: true,
        result: { found: false, query: name, players: [] },
        meta: { dataMode: DATA_MODE, source: meta },
      });
    }
    // Enrich the top hit with profile personalInfo when possible.
    let profile = null;
    let profileMeta = null;
    try {
      const p = await getPlayerProfile(first.id);
      profile = p.data;
      profileMeta = p.meta;
    } catch (err) {
      profileMeta = { error: err.message };
    }
    send(res, 200, {
      success: true,
      result: {
        found: true,
        query: name,
        playerId: first.id,
        name: profile?.name || first.name,
        country: profile?.country || first.country,
        role: first.role,
        imageUrl: profile?.imageUrl || '',
        personalInfo: profile?.personalInfo || null,
        players: data.players,
      },
      meta: { dataMode: DATA_MODE, search: meta, profile: profileMeta },
    });
  } catch (err) {
    statusFor(res, err, 'player search failed');
  }
}

async function handlePlayerById(req, res, playerId) {
  try {
    const { data, meta } = await getPlayerProfile(playerId);
    send(res, 200, {
      success: true,
      result: { found: data.found, player: data },
      meta: { dataMode: DATA_MODE, source: meta },
    });
  } catch (err) {
    statusFor(res, err, 'player profile fetch failed');
  }
}

async function handleCricinfoList(req, res, kind, q) {
  try {
    const { data, meta } = await getCricinfoList(kind, q.get('date'));
    const matches = normalizeCricinfoList(data);
    send(res, 200, {
      success: true,
      result: { found: matches.length > 0, count: matches.length, matches },
      meta: { dataMode: DATA_MODE, source: meta },
    });
  } catch (err) {
    statusFor(res, err, 'cricinfo list fetch failed');
  }
}

async function handleCricinfoMatch(req, res, matchId, q) {
  const seriesId = q.get('seriesId') || '';
  if (!seriesId) {
    return fail(res, 400, { message: 'seriesId query parameter is required (hs-consumer-api needs it)' });
  }
  try {
    const { data, meta } = await getCricinfoMatch(seriesId, matchId);
    send(res, 200, {
      success: true,
      result: { found: true, match: data },
      meta: { dataMode: DATA_MODE, source: meta },
    });
  } catch (err) {
    statusFor(res, err, 'cricinfo match fetch failed');
  }
}

async function handleImg(req, res, q) {
  const raw = q.get('u');
  if (!raw) return fail(res, 400, { message: 'missing query parameter u' });
  let target;
  try {
    target = new URL(raw);
  } catch {
    return fail(res, 400, { message: 'u is not a valid URL' });
  }
  if (target.protocol !== 'https:' && target.protocol !== 'http:') {
    return fail(res, 400, { message: 'only http(s) images are allowed' });
  }
  if (!IMG_ALLOWLIST.has(target.hostname)) {
    return fail(res, 403, { message: `host not allowlisted: ${target.hostname}` });
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    const upstream = await fetch(target, { signal: controller.signal, redirect: 'follow' });
    clearTimeout(timer);
    if (!upstream.ok) return fail(res, 502, { message: `image upstream HTTP ${upstream.status}` });
    const type = upstream.headers.get('content-type') || 'application/octet-stream';
    if (!type.startsWith('image/')) return fail(res, 502, { message: `not an image: ${type}` });
    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.length > IMG_MAX_BYTES) return fail(res, 502, { message: 'image too large' });
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': buf.length,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
    });
    res.end(buf);
  } catch (err) {
    fail(res, 502, { message: `image fetch failed: ${err.message}` });
  }
}

function statusFor(res, err, prefix) {
  if (err instanceof UpstreamError) {
    const status = err.code === 'NO_FIXTURE' ? 404 : err.status === 404 ? 404 : 502;
    return fail(res, status, {
      message: `${prefix}: ${err.message}`,
      upstreamStatus: err.status || 0,
      url: err.url || undefined,
      code: err.code || undefined,
    });
  }
  return fail(res, 500, { message: `${prefix}: ${err.message}` });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

/**
 * Core request handler. Works with Node's http req/res AND Vercel's
 * serverless req/res (same interface: req.url/method/headers,
 * res.writeHead/res.end), which is why `api/index.js` re-exports it.
 */
export async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const q = url.searchParams;
  const origin = baseUrl(req);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }
  if (req.method !== 'GET') return fail(res, 405, { message: 'only GET is supported' });

  try {
    // --- meta ---
    if (path === '/' || path === '/index.json') {
      return send(res, 200, {
        success: true,
        name: 'CricketAPI',
        disclaimer: 'For educational purposes only. Commercial or business use is prohibited.',
        dataMode: DATA_MODE,
        endpoints: [
          'GET /health',
          'GET /sources/status',
          'GET /espn/match/:id/commentary?league=ID&page=1',
          'GET /crex/live',
          'GET /crex/recent',
          'GET /crex/upcoming',
          'GET /espn/live',
          'GET /espn/recent',
          'GET /espn/upcoming',
          'GET /espn/match/:id?league=ID&date=YYYYMMDD',
          'GET /espn/match/:id/scorecard?league=ID&date=YYYYMMDD',
          'GET /espn/match/:id/squads?league=ID',
          'GET /espn/series/:id/matches?date=YYYYMMDD',
          'GET /espn/standings/:id',
          'GET /cb/live',
          'GET /cb/recent',
          'GET /cb/upcoming',
          'GET /cb/search?q=TEAM_OR_NAME',
          'GET /cb/match/:id[?source=auto|modern|legacy]',
          'GET /cb/match/:id/scorecard[?source=modern|legacy]',
          'GET /cb/match/:id/commentary?page=0',
          'GET /cb/match/:id/squads[?source=auto|modern|legacy]',
          'GET /cb/player/name?q=Virat%20Kohli',
          'GET /cb/player/:id',
          'GET /cb/series/:id/matches',
          'GET /cb/series/:id/points-table',
          'GET /cricinfo/current',
          'GET /cricinfo/live',
          'GET /cricinfo/scheduled?date=DD-MM-YYYY',
          'GET /cricinfo/result?date=DD-MM-YYYY',
          'GET /cricinfo/match/:id?seriesId=...',
          'GET /img?u=<allowlisted image url>',
        ],
        fixturesAvailable: fixtureIds(),
      });
    }
    if (path === '/health') {
      return send(res, 200, { success: true, status: 'ok', dataMode: DATA_MODE, uptime: process.uptime() });
    }

    if (path === '/sources/status') {
      const probes = await Promise.all([
        ['espn', () => getEspnMatches('live')],
        ['crex', () => getCrexMatches()],
      ].map(async ([name, fn]) => {
        try { const r = await fn(); return { name, available: true, count: r.data.length, meta: r.meta }; }
        catch (err) { return { name, available: false, error: err.message, upstreamStatus: err.status || 0 }; }
      }));
      return send(res, 200, { success: true, dataMode: DATA_MODE, sources: probes });
    }

    const crexList = path.match(/^\/crex\/(live|recent|upcoming)$/);
    if (crexList) {
      const r = await getCrexMatches(crexList[1]);
      return send(res, 200, { success: true, result: { found: r.data.length > 0, count: r.data.length,
        matches: r.data.map((m) => ({ ...presentMatch(m, origin), startTimeText: m.startTimeText })) },
        meta: { dataMode: DATA_MODE, source: r.meta } });
    }

    // --- Public ESPN scoreboard API (IDs are ESPN IDs, not Cricbuzz IDs) ---
    if (path.startsWith('/espn/')) {
      let r, result;
      const list = path.match(/^\/espn\/(live|recent|upcoming)$/);
      const series = path.match(/^\/espn\/series\/(\d+)\/matches$/);
      const standings = path.match(/^\/espn\/standings\/(\d+)$/);
      const match = path.match(/^\/espn\/match\/(\d+)(?:\/(scorecard|squads|commentary))?$/);
      if (list) {
        r = await getEspnMatches(list[1]);
        result = { found: r.data.length > 0, count: r.data.length, matches: r.data.map((m) => presentMatch(m, origin)) };
      } else if (series) {
        if (q.has('date') && !/^\d{8}$/.test(q.get('date'))) return fail(res, 400, { message: 'date must be YYYYMMDD' });
        r = await getEspnSeries(series[1], q.get('date'));
        result = { count: r.data.length, matches: r.data.map((m) => presentMatch(m, origin)) };
      } else if (standings) {
        r = await getEspnStandings(standings[1]); result = r.data;
      } else if (match) {
        if (!/^\d+$/.test(q.get('league') || '')) return fail(res, 400, { message: 'league query parameter is required (numeric ESPN league ID)' });
        if (q.has('date') && !/^\d{8}$/.test(q.get('date'))) return fail(res, 400, { message: 'date must be YYYYMMDD' });
        if (match[2] === 'commentary') {
          if (q.has('page') && !/^[1-9]\d{0,3}$/.test(q.get('page'))) return fail(res, 400, { message: 'page must be an integer from 1 to 9999' });
          r = await getEspnCommentary(q.get('league'), match[1], Number(q.get('page') || 1));
          result = { matchId: match[1], ...r.data };
        } else if (match[2] === 'scorecard') {
          r = await getEspnScorecard(q.get('league'), match[1], q.get('date'));
          result = r.data;
        } else {
          r = await getEspnMatch(q.get('league'), match[1], q.get('date'), match[2] === 'squads');
          result = match[2] === 'squads' ? { matchId: match[1], teams: normalizeEspnSquads(r.data.teams) }
            : { found: true, match: { ...r.data, ...linkSet(origin, match[1], r.data) } };
        }
      } else return fail(res, 404, { message: 'unknown ESPN route' });
      return send(res, 200, { success: true, result, meta: { dataMode: DATA_MODE, source: r.meta } });
    }

    // --- Cricbuzz ---
    if (path === '/cb/live') return await handleCbList(req, res, 'live', origin, q.get('q'));
    if (path === '/cb/recent') return await handleCbList(req, res, 'recent', origin, q.get('q'));
    if (path === '/cb/upcoming') return await handleCbList(req, res, 'upcoming', origin, q.get('q'));
    if (path === '/cb/search') return await handleSearch(req, res, origin, q.get('q'));
    if (path === '/cb/player/name') return await handlePlayerByName(req, res, q);

    let m;
    if ((m = path.match(/^\/cb\/player\/([^/]+)$/))) return await handlePlayerById(req, res, m[1]);
    if ((m = path.match(/^\/cb\/series\/(\d+)\/matches$/))) {
      try {
        const { data, meta } = await getSeriesMatches(m[1]);
        return send(res, 200, { success: true, result: data, meta: { dataMode: DATA_MODE, source: meta } });
      } catch (err) {
        return statusFor(res, err, 'series matches failed');
      }
    }
    if ((m = path.match(/^\/cb\/series\/(\d+)\/points-table$/))) {
      try {
        const { data, meta } = await getPointsTable(m[1]);
        return send(res, 200, { success: true, result: data, meta: { dataMode: DATA_MODE, source: meta } });
      } catch (err) {
        return statusFor(res, err, 'points table failed');
      }
    }
    if ((m = path.match(/^\/cb\/match\/(\d+)\/scorecard$/))) return await handleScorecard(req, res, m[1], q);
    if ((m = path.match(/^\/cb\/match\/(\d+)\/commentary$/))) return await handleCommentary(req, res, m[1], q);
    if ((m = path.match(/^\/cb\/match\/(\d+)\/squads$/))) return await handleSquads(req, res, m[1], q);
    if ((m = path.match(/^\/cb\/match\/(\d+)$/))) return await handleMatchDetail(req, res, origin, m[1], q);

    // --- ESPNcricinfo ---
    if (path === '/cricinfo/current') return await handleCricinfoList(req, res, 'current', q);
    if (path === '/cricinfo/live') return await handleCricinfoList(req, res, 'live', q);
    if (path === '/cricinfo/scheduled') return await handleCricinfoList(req, res, 'scheduled', q);
    if (path === '/cricinfo/result') return await handleCricinfoList(req, res, 'result', q);
    if ((m = path.match(/^\/cricinfo\/match\/(\d+)$/))) return await handleCricinfoMatch(req, res, m[1], q);

    // --- utility ---
    if (path === '/img') return await handleImg(req, res, q);

    fail(res, 404, { message: `no route for ${path}`, hint: 'GET / for the endpoint index' });
  } catch (err) {
    console.error('[CricketAPI]', err);
    statusFor(res, err, 'request failed');
  }
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

export function createServer() {
  return http.createServer((req, res) => {
    handler(req, res).catch((err) => {
      console.error('[CricketAPI] unhandled', err);
      try {
        fail(res, 500, { message: `internal error: ${err.message}` });
      } catch {
        res.end();
      }
    });
  });
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const server = createServer();
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`CricketAPI listening on http://0.0.0.0:${PORT} (DATA_MODE=${DATA_MODE})`);
  });
}
