import { parseCareerTables, parseProfileBiography, profileNameFromTitle } from './player-career.js';
import { reviewedCricbuzzUrl } from './player-profile-links.js';
import { getCrexMatches } from './crex.js';
import { fetchEspnHeader } from './espn.js';
// Upstream providers. Each function returns { data, meta } where meta describes
// provenance: source (live|fixture), upstream URL, and substitution flags.
// Recordings are used only in explicit DATA_MODE=fixtures.

import {
  BASES,
  CRICBUZZ_API_HEADERS,
  CRICBUZZ_HTML_HEADERS,
  CRICINFO_HEADERS,
  DATA_MODE,
  TTL,
} from './config.js';
import { fetchJson, fetchText, stripJsonp, UpstreamError } from './http.js';
import { cached } from './cache.js';
import { resolveFixture } from './fixtures.js';
import {
  commentaryBundle,
  normalizeCbziosLive,
  normalizeCbziosMatchDetail,
  normalizeCbziosScorecard,
  normalizeCbziosSquads,
  normalizeModernScorecard,
  normalizeModernSquads,
  normalizeTypeMatches,
} from './normalize.js';

const FIXTURE_MODE = DATA_MODE === 'fixtures';

/**
 * Run `liveFn`; recordings are allowed only in explicit fixtures mode.
 * `normalizeFixture` maps the raw recorded payload into the same shape that
 * `liveFn` returns (fixtures are raw upstream captures; liveFn normalizes on
 * the way out, so fixture mode must normalize too). Always returns { data, meta }.
 */
async function withFallback({ fixtureOp, fixtureId, liveFn, normalizeFixture, ttl, cacheKey }) {
  if (FIXTURE_MODE) {
    const fx = resolveFixture(fixtureOp, fixtureId);
    if (!fx) {
      const err = new UpstreamError(`no fixture recorded for ${fixtureOp}`, { status: 404 });
      err.code = 'NO_FIXTURE';
      throw err;
    }
    return {
      data: normalizeFixture ? normalizeFixture(fx.data) : fx.data,
      meta: {
        source: 'fixture',
        fixtureFile: fx.file,
        substitutedForId: fx.substitutedForId,
        cached: false,
      },
    };
  }
  // Production must never disguise a recording as a current score.
  return cached(cacheKey, ttl, liveFn);
}

function liveMeta(url) {
  return { source: 'live', upstream: url, cached: false };
}

// ---------------------------------------------------------------------------
// Cricbuzz modern JSON API (www.cricbuzz.com/api/...)
// ---------------------------------------------------------------------------

const MODERN_LISTS = {
  live: 'live',
  recent: 'recent',
  upcoming: 'upcoming',
};

/** kind: live | recent | upcoming -> normalized match list */
export async function getCricbuzzMatches(kind = 'live') {
  const route = MODERN_LISTS[kind] || 'live';
  const url = `${BASES.cricbuzz}/api/cricket-match/${route}`;
  return withFallback({
    fixtureOp: `cb.${route}`,
    normalizeFixture: normalizeTypeMatches,
    ttl: kind === 'live' ? TTL.live : kind === 'recent' ? TTL.recent : TTL.upcoming,
    cacheKey: `cb:list:${route}`,
    liveFn: async () => {
      try {
        const { json } = await fetchJson(url, { headers: CRICBUZZ_API_HEADERS, retries: 0 });
        if (!json || !Array.isArray(json.typeMatches)) throw new UpstreamError('invalid Cricbuzz list', { url });
        return { data: normalizeTypeMatches(json), meta: liveMeta(url) };
      } catch (cbError) {
        const ciUrl = `${BASES.cricinfo}/v1/pages/matches/current?lang=en&latest=true`;
        try {
          const { json } = await fetchJson(ciUrl, { headers: CRICINFO_HEADERS, retries: 0 });
          if (!Array.isArray(json.matches)) throw new UpstreamError('invalid Cricinfo list');
          const data = json.matches.map(cricinfoMatch).filter((m) => m.category === route);
          if (!data.length) throw new UpstreamError('Cricinfo has no matches for requested category');
          return { data, meta: { ...liveMeta(ciUrl), fallbackReason: cbError.message } };
        } catch (ciError) {
          try {
            const result = await fetchEspnHeader(route);
            return { ...result, meta: { ...result.meta, upstreamErrors: [cbError.message, ciError.message] } };
          } catch (espnError) {
            const result = await getCrexMatches(route);
            return { ...result, meta: { ...result.meta, upstreamErrors: [cbError.message, ciError.message, espnError.message] } };
          }
        }
      }
    },
  });
}

/** Legacy mobile API — used as a second source / fallback for live scores. */
export async function getCbziosLive() {
  const path = '/cbzios/match/livematches';
  const httpsUrl = `${BASES.cricbuzzMappsHttps}${path}`;
  const httpUrl = `${BASES.cricbuzzMappsHttp}${path}`;
  return withFallback({
    fixtureOp: 'cbzios.live',
    normalizeFixture: normalizeCbziosLive,
    ttl: TTL.live,
    cacheKey: 'cbzios:live',
    liveFn: async () => {
      let lastErr;
      for (const url of [httpsUrl, httpUrl]) {
        try {
          const { json } = await fetchJson(url, { headers: CRICBUZZ_API_HEADERS });
          return { data: normalizeCbziosLive(json), meta: liveMeta(url) };
        } catch (err) {
          lastErr = err;
        }
      }
      throw lastErr;
    },
  });
}

/** Modern match header + live score, merged into one detail object. */
export async function getModernMatchDetail(matchId) {
  const infoUrl = `${BASES.cricbuzz}/api/cricket-match/${matchId}/match-info`;
  const scoreUrl = `${BASES.cricbuzz}/api/cricket-match/${matchId}/live-score`;
  return withFallback({
    fixtureOp: 'cbzios.match',
    fixtureId: matchId,
    // In fixture mode only a legacy-shaped capture exists; normalize it the
    // same way getCbziosMatchDetail does so callers get one shape.
    normalizeFixture: normalizeCbziosMatchDetail,
    ttl: TTL.matchInfo,
    cacheKey: `cb:detail:${matchId}`,
    liveFn: async () => {
      const { json: info } = await fetchJson(infoUrl, { headers: CRICBUZZ_API_HEADERS });
      const h = info.matchHeader || info;
      let miniscore = null;
      let matchScore = null;
      try {
        const { json: score } = await fetchJson(scoreUrl, { headers: CRICBUZZ_API_HEADERS });
        miniscore = score.miniscore || null;
        matchScore = score.matchScore || null;
      } catch {
        // live-score is optional; detail still useful without it
      }
      const venue = h.venueInfo || {};
      return {
        data: {
          matchId: String(matchId),
          teams: `${h.team1?.name || h.team1?.shortName || 'T1'} vs ${h.team2?.name || h.team2?.shortName || 'T2'}`,
          team1: { id: String(h.team1?.id ?? ''), name: str(h.team1?.name), short: str(h.team1?.shortName) },
          team2: { id: String(h.team2?.id ?? ''), name: str(h.team2?.name), short: str(h.team2?.shortName) },
          series: { id: String(h.seriesId ?? ''), name: str(h.seriesName) },
          matchDesc: str(h.matchDescription),
          format: str(h.matchFormat),
          state: str(h.state),
          stateTitle: '',
          status: str(h.status),
          toss: {
            winner: str(h.tossResults?.tossWinnerName),
            decision: str(h.tossResults?.decision),
          },
          startTime: h.matchStartTimestamp ?? null,
          endTime: h.matchCompleteTimestamp ?? null,
          venue: {
            ground: str(venue.ground),
            city: str(venue.city),
            country: str(venue.country),
            timezone: '',
            lat: '',
            long: '',
          },
          officials: {
            umpire1: str(h.umpire1?.name),
            umpire2: str(h.umpire2?.name),
            umpire3: str(h.umpire3?.name),
            referee: str(h.matchReferee?.name),
          },
          playerOfTheMatch: [],
          miniscore: miniscore ? normalizeMiniscore(miniscore) : null,
          matchScore,
          source: 'cricbuzz-modern',
        },
        meta: liveMeta(infoUrl),
      };
    },
  });
}

function str(v) {
  return v === undefined || v === null ? '' : String(v);
}

function normalizeMiniscore(ms) {
  const bat = (p) =>
    p
      ? {
          id: str(p.batId ?? p.id),
          name: str(p.batName ?? p.name),
          runs: Number(p.batRuns ?? p.runs ?? 0),
          balls: Number(p.batBalls ?? p.balls ?? 0),
          fours: Number(p.batFours ?? p.fours ?? 0),
          sixes: Number(p.batSixes ?? p.sixes ?? 0),
          strikeRate: p.batStrikeRate ?? p.strikeRate ?? null,
        }
      : null;
  const bowl = (p) =>
    p
      ? {
          id: str(p.bowlId ?? p.id),
          name: str(p.bowlName ?? p.name),
          overs: Number(p.bowlOvs ?? p.overs ?? 0),
          maidens: Number(p.bowlMaidens ?? p.maidens ?? 0),
          runs: Number(p.bowlRuns ?? p.runs ?? 0),
          wickets: Number(p.bowlWkts ?? p.wickets ?? 0),
          economy: p.bowlEcon ?? p.economy ?? null,
        }
      : null;
  return {
    inningsId: ms.inningsId ?? null,
    overs: ms.overs ?? null,
    currentRunRate: ms.currentRunRate ?? null,
    requiredRunRate: ms.requiredRunRate ?? null,
    target: ms.target ?? null,
    remRunsToWin: ms.remRunsToWin ?? null,
    remBallsToWin: ms.remBallsToWin ?? null,
    recentOvers: str(ms.recentOvsStats),
    status: str(ms.status),
    batTeam: ms.batTeam
      ? { id: str(ms.batTeam.teamId), score: ms.batTeam.teamScore ?? null, wickets: ms.batTeam.teamWkts ?? null }
      : null,
    batsmanStriker: bat(ms.batsmanStriker),
    batsmanNonStriker: bat(ms.batsmanNonStriker),
    bowlerStriker: bowl(ms.bowlerStriker),
    bowlerNonStriker: bowl(ms.bowlerNonStriker),
    partnership: ms.partnerShip
      ? { runs: Number(ms.partnerShip.runs ?? 0), balls: Number(ms.partnerShip.balls ?? 0) }
      : null,
  };
}

export async function getScorecard(matchId) {
  const url = `${BASES.cricbuzz}/api/cricket-match/${matchId}/scorecard`;
  return withFallback({
    fixtureOp: 'cb.scorecard',
    fixtureId: matchId,
    normalizeFixture: normalizeModernScorecard,
    ttl: TTL.scorecard,
    cacheKey: `cb:scorecard:${matchId}`,
    liveFn: async () => {
      const { json } = await fetchJson(url, { headers: CRICBUZZ_API_HEADERS });
      return { data: normalizeModernScorecard(json), meta: liveMeta(url) };
    },
  });
}

/** Legacy scorecard — separate route so callers can pick a source. */
export async function getCbziosScorecard(matchId) {
  const path = `/cbzios/match/${matchId}/scorecard`;
  const urls = [`${BASES.cricbuzzMappsHttps}${path}`, `${BASES.cricbuzzMappsHttp}${path}`];
  return withFallback({
    fixtureOp: 'cbzios.scorecard',
    fixtureId: matchId,
    normalizeFixture: normalizeCbziosScorecard,
    ttl: TTL.scorecard,
    cacheKey: `cbzios:scorecard:${matchId}`,
    liveFn: async () => {
      let lastErr;
      for (const url of urls) {
        try {
          const { json } = await fetchJson(url, { headers: CRICBUZZ_API_HEADERS });
          return { data: normalizeCbziosScorecard(json), meta: liveMeta(url) };
        } catch (err) {
          lastErr = err;
        }
      }
      throw lastErr;
    },
  });
}

export async function getCommentary(matchId, page = 0) {
  const modernUrl = `${BASES.cricbuzz}/api/cricket-match/${matchId}/commentary/${page}`;
  const legacyPath = `/cbzios/match/${matchId}/commentary`;
  const legacyUrls = [
    `${BASES.cricbuzzMappsHttps}${legacyPath}`,
    `${BASES.cricbuzzMappsHttp}${legacyPath}`,
  ];
  return withFallback({
    fixtureOp: 'cb.commentary',
    fixtureId: page === 0 ? matchId : undefined,
    normalizeFixture: commentaryBundle,
    ttl: TTL.commentary,
    cacheKey: `cb:commentary:${matchId}:${page}`,
    liveFn: async () => {
      // Modern endpoint first, then legacy, then HTML-free match-api JSON.
      const attempts = [
        async () => {
          const { json } = await fetchJson(modernUrl, { headers: CRICBUZZ_API_HEADERS });
          if (json?.commentaryList || json?.commentary) return { json, url: modernUrl };
          throw new UpstreamError('modern commentary empty', { url: modernUrl });
        },
        ...legacyUrls.map((url) => async () => {
          const { json } = await fetchJson(url, { headers: CRICBUZZ_API_HEADERS });
          if (json?.comm_lines) return { json, url };
          throw new UpstreamError('legacy commentary empty', { url });
        }),
        async () => {
          const url = `${BASES.cricbuzz}/match-api/${matchId}/commentary.json`;
          const { json } = await fetchJson(url, { headers: CRICBUZZ_API_HEADERS });
          return { json, url };
        },
      ];
      let lastErr;
      for (const fn of attempts) {
        try {
          const { json, url } = await fn();
          return { data: commentaryBundle(json), meta: liveMeta(url) };
        } catch (err) {
          lastErr = err;
        }
      }
      throw lastErr;
    },
  });
}

export async function getSquads(matchId) {
  const url = `${BASES.cricbuzz}/api/cricket-match/${matchId}/squads`;
  return withFallback({
    fixtureOp: 'cbzios.match',
    fixtureId: matchId,
    // Fixture corpus only has the legacy summary; its squad extraction works.
    normalizeFixture: (raw) => ({
      matchId: String(matchId),
      teams: normalizeCbziosSquads(raw),
      source: 'fixture-cbzios',
    }),
    ttl: TTL.squads,
    cacheKey: `cb:squads:${matchId}`,
    liveFn: async () => {
      const { json } = await fetchJson(url, { headers: CRICBUZZ_API_HEADERS });
      const teams = normalizeModernSquads(json);
      if (!teams.length) throw new UpstreamError('modern squads empty', { url });
      return { data: { matchId: String(matchId), teams, source: 'cricbuzz-modern' }, meta: liveMeta(url) };
    },
  });
}

/** Legacy squads come embedded in the cbzios match summary. */
export async function getCbziosSquads(matchId) {
  const path = `/cbzios/match/${matchId}`;
  const urls = [`${BASES.cricbuzzMappsHttps}${path}`, `${BASES.cricbuzzMappsHttp}${path}`];
  return withFallback({
    fixtureOp: 'cbzios.match',
    fixtureId: matchId,
    normalizeFixture: (raw) => ({
      matchId: String(matchId),
      teams: normalizeCbziosSquads(raw),
      source: 'cricbuzz-cbzios',
    }),
    ttl: TTL.squads,
    cacheKey: `cbzios:match:${matchId}`,
    liveFn: async () => {
      let lastErr;
      for (const url of urls) {
        try {
          const { json } = await fetchJson(url, { headers: CRICBUZZ_API_HEADERS });
          return {
            data: { matchId: String(matchId), teams: normalizeCbziosSquads(json), source: 'cricbuzz-cbzios' },
            meta: liveMeta(url),
          };
        } catch (err) {
          lastErr = err;
        }
      }
      throw lastErr;
    },
  });
}

/** Legacy full match detail (header, venue, officials, toss, squads). */
export async function getCbziosMatchDetail(matchId) {
  const path = `/cbzios/match/${matchId}`;
  const urls = [`${BASES.cricbuzzMappsHttps}${path}`, `${BASES.cricbuzzMappsHttp}${path}`];
  return withFallback({
    fixtureOp: 'cbzios.match',
    fixtureId: matchId,
    normalizeFixture: normalizeCbziosMatchDetail,
    ttl: TTL.matchInfo,
    cacheKey: `cbzios:detail:${matchId}`,
    liveFn: async () => {
      let lastErr;
      for (const url of urls) {
        try {
          const { json } = await fetchJson(url, { headers: CRICBUZZ_API_HEADERS });
          return { data: normalizeCbziosMatchDetail(json), meta: liveMeta(url) };
        } catch (err) {
          lastErr = err;
        }
      }
      throw lastErr;
    },
  });
}

// ---------------------------------------------------------------------------
// Player search + profile (Cricbuzz)
// ---------------------------------------------------------------------------

/**
 * Player search via the JSONP endpoint /api/cricket-search/v2.
 * Returns raw search hits: { id, name, teamName, role }.
 * NOTE: this endpoint is code-observed but not fixture-verified; it may 404.
 */
export async function searchPlayers(query) {
  const url = `${BASES.cricbuzz}/api/cricket-search/v2?action=cricketers&q=${encodeURIComponent(query)}&callback=`;
  return withFallback({
    fixtureOp: 'cb.playerSearch', // no fixture registered -> NO_FIXTURE in fixtures mode
    ttl: TTL.playerSearch,
    cacheKey: `cb:playersearch:${query.toLowerCase()}`,
    liveFn: async () => {
      const { text } = await fetchText(url, { headers: CRICBUZZ_API_HEADERS });
      const json = JSON.parse(stripJsonp(text));
      const hits = (json?.player || json?.players || []).map((p) => ({
        id: String(p.id ?? p.playerId ?? ''),
        name: String(p.name ?? p.playerName ?? ''),
        country: String(p.teamName ?? p.country ?? ''),
        role: String(p.role ?? ''),
      }));
      return { data: { query, found: hits.length > 0, players: hits }, meta: liveMeta(url) };
    },
  });
}

/**
 * Player profile HTML scrape of /profiles/{id}.
 * Extracts personalInfo fields with a label scanner (code-observed approach).
 */
export async function getPlayerProfile(playerId) {
  const url = reviewedCricbuzzUrl(playerId) || `${BASES.cricbuzz}/profiles/${playerId}`;
  return withFallback({
    fixtureOp: 'cb.playerProfile', // no fixture registered
    ttl: TTL.playerProfile,
    cacheKey: `cb:profile:${playerId}`,
    liveFn: async () => {
      const { text: html } = await fetchText(url, { headers: CRICBUZZ_HTML_HEADERS });
      const profile = parseProfileHtml(html, playerId);
      return { data: profile, meta: liveMeta(url) };
    },
  });
}

export function parseProfileHtml(html, playerId) {
  // Name from the page's main heading (observed selector: h1.cb-font-40).
  const h1 = html.match(/<h1[^>]*class="[^"]*cb-font-40[^"]*"[^>]*>([\s\S]*?)<\/h1>/i);
  const name = h1 ? stripTags(h1[1]) : profileNameFromTitle(html);

  // Personal-info label scanner: find labels in the flattened text and take
  // the value that follows (approach observed in public profile scrapers).
  const text = flattenText(html);
  const personalInfo = {
    born: scanLabel(text, ['Born', 'Date of Birth']),
    birthPlace: scanLabel(text, ['Birth Place', 'Place of Birth']),
    height: scanLabel(text, ['Height']),
    role: scanLabel(text, ['Role', 'Playing Role']),
    battingStyle: scanLabel(text, ['Batting Style']),
    bowlingStyle: scanLabel(text, ['Bowling Style']),
  };

  // Country: first short gray line under the name (observed .cb-text-gray).
  const countryMatch = html.match(/<div[^>]*class="[^"]*cb-text-gray[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  const country = countryMatch ? stripTags(countryMatch[1]) : '';

  // Profile image (observed pattern: static.cricbuzz.com/a/img/v1/.../player images).
  const img = html.match(/<img[^>]+src="(https:\/\/static\.cricbuzz\.com\/[^"]*(?:player|i1)[^"]*)"/i);

  return {
    playerId: String(playerId),
    found: !!(name || personalInfo.born),
    name,
    country,
    imageUrl: img ? img[1] : '',
    personalInfo,
    biography: parseProfileBiography(html),
    careerStats: parseCareerTables(html),
    careerSourceUrl: reviewedCricbuzzUrl(playerId) || `https://www.cricbuzz.com/profiles/${encodeURIComponent(playerId)}`,
    // Retrieval is not a guarantee that the provider has updated career totals.
    careerUpdatedAt: null,
    source: 'cricbuzz-profile-html',
  };
}

function stripTags(s) {
  return String(s)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function flattenText(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n');
}

function scanLabel(text, labels) {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const label of labels) {
      if (line === label || line.startsWith(`${label} :`) || line.startsWith(`${label}:`)) {
        const inline = line.slice(label.length).replace(/^[\s:]+/, '').trim();
        if (inline) return inline;
        return lines[i + 1] || '';
      }
      if (line.startsWith(label) && line.length > label.length) {
        const rest = line.slice(label.length).replace(/^[\s:]+/, '').trim();
        if (rest && rest.length < 120) return rest;
      }
    }
  }
  return '';
}

// ---------------------------------------------------------------------------
// Series (Cricbuzz modern)
// ---------------------------------------------------------------------------

export async function getSeriesMatches(seriesId) {
  const url = `${BASES.cricbuzz}/api/cricket-series/${seriesId}/matches`;
  return withFallback({
    fixtureOp: 'cb.seriesMatches',
    ttl: TTL.series,
    cacheKey: `cb:series:${seriesId}`,
    liveFn: async () => {
      const { json } = await fetchJson(url, { headers: CRICBUZZ_API_HEADERS });
      const list = json.matchScheduleMap || json.scheduleAndResults || [];
      const matches = [];
      const walk = (items) => {
        for (const item of items || []) {
          const inner = item.matchScheduleList || item.scheduleAdWrapper?.matchScheduleList || [];
          for (const ms of inner) {
            for (const info of ms.matchInfo || [ms]) {
              if (!info.matchId) continue;
              matches.push({
                matchId: String(info.matchId),
                teams: `${info.team1?.teamName || 'T1'} vs ${info.team2?.teamName || 'T2'}`,
                matchDesc: str(info.matchDesc),
                format: str(info.matchFormat),
                state: str(info.state),
                status: str(info.status),
                startDate: info.startDate ? Number(info.startDate) : null,
                venue: {
                  ground: str(info.venueInfo?.ground),
                  city: str(info.venueInfo?.city),
                },
                source: 'cricbuzz-modern',
              });
            }
          }
          if (item.seriesAdWrapper) walk([item.seriesAdWrapper]);
        }
      };
      walk(list);
      return { data: { seriesId: String(seriesId), count: matches.length, matches }, meta: liveMeta(url) };
    },
  });
}

export async function getPointsTable(seriesId) {
  const url = `${BASES.cricbuzz}/api/series/${seriesId}/points-table`;
  return withFallback({
    fixtureOp: 'cb.pointsTable',
    ttl: TTL.pointsTable,
    cacheKey: `cb:points:${seriesId}`,
    liveFn: async () => {
      const { json } = await fetchJson(url, { headers: CRICBUZZ_API_HEADERS });
      return { data: { seriesId: String(seriesId), pointsTable: json.pointsTable || [] }, meta: liveMeta(url) };
    },
  });
}

// ---------------------------------------------------------------------------
// ESPNcricinfo
// ---------------------------------------------------------------------------

const CRICINFO_LISTS = {
  current: '/v1/pages/matches/current?lang=en&latest=true',
  live: '/v1/pages/matches/live?lang=en',
  scheduled: (date) => `/v1/pages/matches/scheduled?lang=en&filterType=DATE&filterValue=${encodeURIComponent(date)}`,
  result: (date) => `/v1/pages/matches/result?lang=en&filterType=DATE&filterValue=${encodeURIComponent(date)}`,
};

export async function getCricinfoList(kind = 'current', date) {
  const path =
    typeof CRICINFO_LISTS[kind] === 'function'
      ? CRICINFO_LISTS[kind](date)
      : CRICINFO_LISTS[kind] || CRICINFO_LISTS.current;
  const url = `${BASES.cricinfo}${path}`;
  const isCurrent = kind === 'current';
  return withFallback({
    fixtureOp: isCurrent ? 'cricinfo.current' : `cricinfo.${kind}`,
    ttl: TTL.cricinfoList,
    cacheKey: `ci:list:${kind}:${date || ''}`,
    liveFn: async () => {
      try {
        const { json } = await fetchJson(url, { headers: CRICINFO_HEADERS, retries: 0 });
        if (!Array.isArray(json.matches)) throw new UpstreamError('invalid Cricinfo list');
        return { data: json, meta: liveMeta(url) };
      } catch (err) {
        // The header is current-only; do not pretend it answers a historical date.
        if (date) throw err;
        const kindMap = { live: 'live', scheduled: 'upcoming', result: 'recent' };
        const r = await fetchEspnHeader(kindMap[kind]);
        return { data: { matches: r.data.map((m) => ({
          id: m.matchId, title: m.teams, stage: ({ live: 'LIVE', recent: 'FINISHED', upcoming: 'SCHEDULED' })[m.category],
          status: m.status, statusText: m.status, startDate: m.startDate ? new Date(m.startDate).toISOString() : null,
          series: m.series, ground: { name: m.venue.ground, smallName: m.venue.city },
          teams: [m.team1,m.team2].map((t) => ({ team: { name: t.name, abbreviation: t.short }, score: m.scores.filter((s) => s.team === t.short).map((s) => s.score).join(' & ') })),
        })) }, meta: { ...r.meta, fallbackReason: err.message } };
      }
    },
  });
}

export async function getCricinfoMatch(seriesId, matchId) {
  const url = `${BASES.cricinfo}/v1/pages/match/details?lang=en&seriesId=${encodeURIComponent(seriesId)}&matchId=${encodeURIComponent(matchId)}&latest=true`;
  return withFallback({
    fixtureOp: 'cricinfo.match',
    fixtureId: matchId,
    ttl: TTL.cricinfoDetail,
    cacheKey: `ci:match:${seriesId}:${matchId}`,
    liveFn: async () => {
      const { json } = await fetchJson(url, { headers: CRICINFO_HEADERS });
      return { data: json, meta: liveMeta(url) };
    },
  });
}

function cricinfoMatch(m) {
  const team = (t = {}) => ({ id: String(t.team?.id || ''), name: t.team?.name || '', short: t.team?.abbreviation || t.team?.name || '' });
  const category = ({ LIVE: 'live', FINISHED: 'recent', RESULT: 'recent', SCHEDULED: 'upcoming', FIXTURE: 'upcoming' })[m.stage] || 'upcoming';
  const team1 = team(m.teams?.[0]), team2 = team(m.teams?.[1]);
  return { matchId: String(m.id), teams: `${team1.short} vs ${team2.short}`, team1, team2,
    category, live: category === 'live', state: m.stage, status: m.statusText || m.status || '',
    series: { id: String(m.series?.id || ''), name: m.series?.name || '' },
    startDate: Date.parse(m.startDate) || null, endDate: Date.parse(m.endDate) || null,
    venue: { ground: m.ground?.name || '', city: m.ground?.smallName || '' },
    scores: (m.teams || []).filter((t) => t.score).map((t) => ({ team: team(t).short, score: t.score, overs: t.scoreInfo || '' })),
    source: 'espncricinfo', format: m.format || '' };
}
