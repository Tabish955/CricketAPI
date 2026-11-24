// Normalizers: turn raw upstream payloads into the unified CricketAPI shapes.
// Every mapping is either fixture-verified (tests/fixtures) or code-observed
// in public scrapers — provenance is documented in docs/REVERSE-ENGINEERING.md.

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

export function str(v) {
  return v === undefined || v === null ? '' : String(v);
}

export function stripHtml(s) {
  return str(s)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const COMPLETE_RE = /\b(won by|drawn|tied|abandoned|no result|won the match)\b/i;

/** Categorize a match from its state/status text (logic observed in public scrapers). */
export function categorize(state, status) {
  const st = str(state).toLowerCase();
  const fs = str(status).toLowerCase();
  if (st === 'preview' || st === 'upcoming' || st === 'scheduled') return 'upcoming';
  if (
    st === 'complete' ||
    st === 'recent' ||
    st === 'result' ||
    COMPLETE_RE.test(fs)
  ) {
    return 'recent';
  }
  return 'live';
}

// ---------------------------------------------------------------------------
// Cricbuzz modern API: /api/cricket-match/{live,recent,upcoming}
// Payload shape (fixture-verified): { typeMatches: [ { matchType,
//   seriesMatches: [ { seriesAdWrapper: { seriesId, seriesName, matches:
//   [ { matchInfo, matchScore } ] } } ] } ] }
// ---------------------------------------------------------------------------

const asArr = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);

/**
 * Rebuild a nested object from pandas-style dotted keys
 * (`a.b.c -> {a:{b:{c}}}`). Used for flattened captures such as
 * fixtures/cricbuzz-recent.json (one match per row, dotted columns).
 */
export function unflattenDotted(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    const parts = k.split('.');
    let cur = out;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      if (typeof cur[p] !== 'object' || cur[p] === null || Array.isArray(cur[p])) cur[p] = {};
      cur = cur[p];
    }
    cur[parts[parts.length - 1]] = v;
  }
  return out;
}

export function normalizeTypeMatches(payload) {
  // Flattened capture: an array of rows whose keys contain dots.
  const typeMatches = Array.isArray(payload)
    ? payload.map((row) => {
        const flattened = typeof row === 'object' && row && Object.keys(row).some((k) => k.includes('.'));
        const u = flattened ? unflattenDotted(row) : row;
        return u?.typeMatches ?? u;
      })
    : payload?.typeMatches;
  const out = [];
  for (const tm of asArr(typeMatches)) {
    for (const sm of asArr(tm.seriesMatches)) {
      const wrapper = sm.seriesAdWrapper || sm;
      const seriesId = wrapper.seriesId;
      const seriesName = wrapper.seriesName || '';
      for (const m of asArr(wrapper.matches)) {
        const info = m.matchInfo;
        if (!info) continue;
        out.push(normalizeModernMatchInfo(info, m.matchScore, { seriesId, seriesName }));
      }
    }
  }
  return out;
}

function inningsFromSide(side, teamShort) {
  if (!side) return [];
  const out = [];
  for (const key of Object.keys(side)) {
    if (!/^inngs\d+$/.test(key)) continue;
    const inn = side[key];
    if (!inn || inn.runs === undefined) continue;
    out.push({
      inningsId: Number(inn.inningsId ?? key.replace('inngs', '')),
      team: teamShort,
      score: `${inn.runs ?? 0}/${inn.wickets ?? 0}`,
      overs: str(inn.overs ?? ''),
      declared: inn.isDeclared ?? inn.decl ?? false,
    });
  }
  return out;
}

export function normalizeModernMatchInfo(info, matchScore, extra = {}) {
  const t1 = info.team1 || {};
  const t2 = info.team2 || {};
  const short1 = t1.teamSName || t1.shortName || t1.teamName || 'T1';
  const short2 = t2.teamSName || t2.shortName || t2.teamName || 'T2';
  const scores = [
    ...inningsFromSide(matchScore?.team1Score, short1),
    ...inningsFromSide(matchScore?.team2Score, short2),
  ];
  const state = str(info.state);
  const status = str(info.status);
  const category = categorize(state, status);
  const venue = info.venueInfo || {};
  return {
    matchId: str(info.matchId),
    teams: `${short1} vs ${short2}`,
    team1: { id: str(t1.teamId), name: str(t1.teamName), short: short1, imageId: str(t1.imageId || '') },
    team2: { id: str(t2.teamId), name: str(t2.teamName), short: short2, imageId: str(t2.imageId || '') },
    series: { id: str(info.seriesId ?? extra.seriesId ?? ''), name: str(info.seriesName || extra.seriesName || '') },
    matchDesc: str(info.matchDesc),
    format: str(info.matchFormat),
    state,
    stateTitle: str(info.stateTitle),
    status,
    category,
    live: category === 'live',
    startDate: info.startDate ? Number(info.startDate) : null,
    endDate: info.endDate ? Number(info.endDate) : null,
    venue: {
      ground: str(venue.ground),
      city: str(venue.city),
      country: str(venue.country),
    },
    scores,
    source: 'cricbuzz-modern',
  };
}

// ---------------------------------------------------------------------------
// Cricbuzz legacy mobile API: mapps.cricbuzz.com/cbzios/match/livematches
// Payload shape (fixture-verified): { matches: [ { match_id, series_id,
//   series_name, header: { state, status, ... }, team1/team2: { id, name,
//   s_name }, bat_team/bow_team: { id, innings: [ { id, score, wkts, overs } ] } } ] }
// ---------------------------------------------------------------------------

export function normalizeCbziosLive(payload) {
  const out = [];
  for (const m of payload?.matches || []) {
    const t1 = m.team1 || {};
    const t2 = m.team2 || {};
    const short1 = t1.s_name || t1.name || 'T1';
    const short2 = t2.s_name || t2.name || 'T2';
    const byId = { [str(t1.id)]: short1, [str(t2.id)]: short2 };
    const scores = [];
    for (const side of [m.bat_team, m.bow_team]) {
      if (!side) continue;
      const sideShort = byId[str(side.id)] || short1;
      for (const inn of side.innings || []) {
        scores.push({
          inningsId: Number(inn.id),
          team: sideShort,
          score: `${inn.score ?? 0}/${inn.wkts ?? 0}`,
          overs: str(inn.overs ?? ''),
          declared: inn.decl === 'true' || inn.decl === true,
        });
      }
    }
    scores.sort((a, b) => a.inningsId - b.inningsId);
    const header = m.header || {};
    const state = str(header.state);
    const status = str(header.status);
    const category = categorize(state, status);
    out.push({
      matchId: str(m.match_id),
      teams: `${short1} vs ${short2}`,
      team1: { id: str(t1.id), name: str(t1.name), short: short1 },
      team2: { id: str(t2.id), name: str(t2.name), short: short2 },
      series: { id: str(m.series_id ?? ''), name: str(m.series_name || '') },
      matchDesc: str(header.match_desc),
      format: str(header.type),
      state,
      stateTitle: str(header.state_title),
      status,
      category,
      live: category === 'live',
      startDate: header.start_time ? Number(header.start_time) * 1000 : null,
      endDate: header.end_time ? Number(header.end_time) * 1000 : null,
      venue: { ground: str(m.venue?.name), city: str(m.venue?.location), country: '' },
      scores,
      batsman: (m.batsman || []).map((p) => ({
        id: str(p.id), name: str(p.name), runs: str(p.r), balls: str(p.b),
        fours: str(p['4s']), sixes: str(p['6s']), strike: p.strike === '1',
      })),
      bowler: (m.bowler || []).map((p) => ({
        id: str(p.id), name: str(p.name), overs: str(p.o), maidens: str(p.m),
        runs: str(p.r), wickets: str(p.w),
      })),
      source: 'cricbuzz-cbzios',
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Scorecards
// ---------------------------------------------------------------------------

/** Modern /api/cricket-match/{id}/scorecard — fixture-verified. */
export function normalizeModernScorecard(payload) {
  const innings = (payload.scoreCard || []).map((inn) => {
    const bat = inn.batTeamDetails || {};
    const bowl = inn.bowlTeamDetails || {};
    const sd = inn.scoreDetails || {};
    const ext = inn.extrasData || {};
    const batsmen = Object.values(bat.batsmenData || {})
      .filter((b) => b && (b.batName || b.name))
      .map((b) => ({
        id: str(b.batId ?? b.id),
        name: str(b.batName ?? b.name),
        runs: Number(b.runs ?? 0),
        balls: Number(b.balls ?? 0),
        fours: Number(b.fours ?? 0),
        sixes: Number(b.sixes ?? 0),
        strikeRate: b.strikeRate != null ? Number(b.strikeRate) : null,
        dismissal: str(b.outDesc) || 'not out',
        isBatting: !!b.isBatting,
        isCaptain: !!b.isCaptain,
        isWk: !!b.isKeeper,
      }));
    const bowlers = Object.values(bowl.bowlersData || {})
      .filter((b) => b && (b.bowlName || b.name))
      .map((b) => ({
        id: str(b.bowlId ?? b.id),
        name: str(b.bowlName ?? b.name),
        overs: Number(b.overs ?? 0),
        maidens: Number(b.maidens ?? 0),
        runs: Number(b.runs ?? 0),
        wickets: Number(b.wickets ?? 0),
        economy: b.economy != null ? Number(b.economy) : null,
        wides: Number(b.wides ?? 0),
        noBalls: Number(b.noBalls ?? 0),
        isBowling: !!b.isBowling,
      }));
    const fow = Object.values(inn.wicketsData || {}).map((w) => ({
      batsman: str(w.batName),
      runs: Number(w.wktRuns ?? 0),
      over: str(w.wktOvr ?? ''),
    }));
    const partnerships = Object.values(inn.partnershipsData || {}).map((p) => ({
      batsman1: str(p.bat1Name || p.bat1Id),
      batsman2: str(p.bat2Name || p.bat2Id),
      runs: Number(p.runs ?? 0),
      balls: Number(p.balls ?? 0),
    }));
    return {
      inningsId: Number(inn.inningsId),
      team: str(bat.batTeamName),
      teamShort: str(bat.batTeamShortName),
      score: `${sd.runs ?? 0}/${sd.wickets ?? 0}`,
      overs: str(sd.overs ?? 0),
      runRate: sd.runRate != null ? Number(sd.runRate) : null,
      target: sd.target ?? null,
      requiredRunRate: sd.reqRunRate ?? null,
      declared: !!sd.isDeclared,
      followOn: !!sd.isFollowOn,
      extras: {
        total: Number(ext.total ?? 0),
        wides: Number(ext.wides ?? 0),
        noBalls: Number(ext.noBalls ?? 0),
        legByes: Number(ext.legByes ?? 0),
        byes: Number(ext.byes ?? 0),
        penalty: Number(ext.penalty ?? 0),
      },
      batsmen,
      bowlers,
      fow,
      partnerships,
    };
  });
  return {
    matchId: str(payload.matchHeader?.matchId ?? payload.scoreCard?.[0]?.matchId),
    status: str(payload.status || payload.matchHeader?.status),
    isComplete: !!payload.isMatchComplete,
    state: str(payload.matchHeader?.state),
    format: str(payload.matchHeader?.matchFormat),
    matchDescription: str(payload.matchHeader?.matchDescription),
    series: str(payload.matchHeader?.seriesName),
    toss: payload.matchHeader?.tossResults
      ? {
          winner: str(payload.matchHeader.tossResults.tossWinnerName),
          decision: str(payload.matchHeader.tossResults.decision),
        }
      : null,
    innings,
    source: 'cricbuzz-modern',
  };
}

/** Legacy cbzios /match/{id}/scorecard — fixture-verified (lowercase keys). */
export function normalizeCbziosScorecard(payload) {
  const innings = (payload.scorecard || []).map((inn) => ({
    inningsId: Number(inn.inningsid),
    team: str(inn.batteamname),
    teamShort: str(inn.batteamsname),
    score: `${inn.score ?? 0}/${inn.wickets ?? 0}`,
    overs: str(inn.overs ?? 0),
    runRate: inn.runrate != null ? Number(inn.runrate) : null,
    target: null,
    requiredRunRate: null,
    declared: !!inn.isdeclared,
    followOn: !!inn.isfollowon,
    extras: {
      total: Number(inn.extras?.total ?? 0),
      wides: Number(inn.extras?.wides ?? 0),
      noBalls: Number(inn.extras?.noballs ?? 0),
      legByes: Number(inn.extras?.legbyes ?? 0),
      byes: Number(inn.extras?.byes ?? 0),
      penalty: Number(inn.extras?.penalty ?? 0),
    },
    batsmen: (inn.batsman || []).map((b) => ({
      id: str(b.id),
      name: str(b.name),
      runs: Number(b.runs ?? 0),
      balls: Number(b.balls ?? 0),
      fours: Number(b.fours ?? 0),
      sixes: Number(b.sixes ?? 0),
      strikeRate: b.strkrate != null ? Number(b.strkrate) : null,
      dismissal: str(b.outdec) || 'not out',
      isBatting: str(b.outdec) === 'batting',
      isCaptain: !!b.iscaptain,
      isWk: !!b.iskeeper,
    })),
    bowlers: (inn.bowler || []).map((b) => ({
      id: str(b.id),
      name: str(b.name),
      overs: Number(b.overs ?? 0),
      maidens: Number(b.maidens ?? 0),
      runs: Number(b.runs ?? 0),
      wickets: Number(b.wickets ?? 0),
      economy: b.economy != null ? Number(b.economy) : null,
      wides: Number(b.wides ?? 0),
      noBalls: Number(b.noballs ?? 0),
      isBowling: false,
    })),
    fow: (inn.fow?.fow || []).map((f) =>
      typeof f === 'string'
        ? { batsman: f, runs: 0, over: '' }
        : { batsman: str(f.batName ?? f.name), runs: Number(f.runs ?? 0), over: str(f.over ?? '') }
    ),
    partnerships: (inn.partnership?.partnership || []).map((p) => ({
      batsman1: str(p.bat1Name || p.bat1),
      batsman2: str(p.bat2Name || p.bat2),
      runs: Number(p.runs ?? 0),
      balls: Number(p.balls ?? 0),
    })),
  }));
  return {
    matchId: '',
    status: str(payload.status),
    isComplete: !!payload.ismatchcomplete,
    state: '',
    innings,
    source: 'cricbuzz-cbzios',
  };
}

// ---------------------------------------------------------------------------
// Commentary
// ---------------------------------------------------------------------------

function normalizeCommItem(c) {
  return {
    inningsId: c.inningsId != null ? Number(c.inningsId) : c.i_id != null ? Number(c.i_id) : null,
    over: c.overNumber ?? c.o_no ?? null,
    ball: c.ballNbr ?? null,
    event: str(c.event || c.evt || 'NONE'),
    text: stripHtml(c.commText ?? c.comm ?? ''),
    runs: c.runs ?? c.totalRuns ?? c.legalRuns ?? null,
    batsman: str(c.batsmanStriker?.batName ?? c.bat_s_name ?? c.batsman ?? ''),
    bowler: str(c.bowlerStriker?.bowlName ?? c.bowl_name ?? c.bowler ?? ''),
    score: c.score != null ? str(c.score) : c.batTeamScore != null ? str(c.batTeamScore) : null,
    wickets: c.wkts ?? null,
    overSummary: str(c.o_summary || ''),
    timestamp: c.timestamp != null ? Number(c.timestamp) : null,
  };
}

/** Accepts: {commentaryList}, {commentary:[{commentaryList}]}, or {comm_lines}. */
export function normalizeCommentary(payload) {
  let list = payload?.commentaryList;
  if (!Array.isArray(list) && Array.isArray(payload?.commentary)) {
    list = payload.commentary.flatMap((inn) => inn.commentaryList || []);
  }
  if (!Array.isArray(list) && Array.isArray(payload?.comm_lines)) {
    list = payload.comm_lines;
  }
  if (!Array.isArray(list)) list = [];
  return list
    .filter((c) => c && (c.commText ?? c.comm) != null)
    .map(normalizeCommItem);
}

/**
 * Bundle commentary with the match-level extras the legacy feed carries
 * (crr/target/last_wkt/over_summary — fixture-verified on cbzios-commentary).
 */
export function commentaryBundle(payload) {
  const lines = normalizeCommentary(payload);
  const hasExtras =
    payload &&
    (payload.crr != null || payload.target != null || payload.over_summary != null || payload.last_wkt != null);
  return {
    matchId: str(payload?.match_id ?? payload?.matchId ?? ''),
    lines,
    extras: hasExtras
      ? {
          crr: payload.crr ?? null,
          target: payload.target ?? null,
          lastWicket: str(payload.last_wkt || ''),
          overSummary: str(payload.over_summary || ''),
        }
      : null,
  };
}

// ---------------------------------------------------------------------------
// Squads
// ---------------------------------------------------------------------------

/** Modern /api/cricket-match/{id}/squads — code-observed shape. */
export function normalizeModernSquads(payload) {
  const teams = payload?.squad || payload?.teams || [];
  return teams.map((t) => ({
    teamId: str(t.teamId ?? t.id),
    teamName: str(t.teamName ?? t.name),
    players: (t.players || t.playerDetails || []).map((p) => ({
      id: str(p.id ?? p.playerId),
      name: str(p.name ?? p.fullName ?? p.playerName),
      role: str(p.role ?? p.playingRole),
      isCaptain: !!(p.isCaptain || p.captain),
      isViceCaptain: !!(p.isVCaptain || p.viceCaptain),
      isWk: !!(p.isWk || p.isWicketkeeper || p.keeper),
      battingStyle: str(p.battingStyle),
      bowlingStyle: str(p.bowlingStyle),
    })),
  }));
}

/** Legacy cbzios match summary (team1/team2 squad ids + players list). */
export function normalizeCbziosSquads(summary) {
  const players = new Map((summary.players || []).map((p) => [str(p.id), p]));
  const mapSide = (side) => ({
    teamId: str(side.id),
    teamName: str(side.name),
    squad: (side.squad || []).map((id) => players.get(str(id))).filter(Boolean).map((p) => ({
      id: str(p.id),
      name: str(p.f_name || p.name),
      role: str(p.speciality),
      isCaptain: false,
      isViceCaptain: false,
      isWk: str(p.speciality).includes('WK'),
      battingStyle: str(p.bat_style),
      bowlingStyle: str(p.bowl_style),
      bench: false,
    })),
    bench: (side.squad_bench || []).map((id) => players.get(str(id))).filter(Boolean).map((p) => ({
      id: str(p.id),
      name: str(p.f_name || p.name),
      role: str(p.speciality),
      bench: true,
    })),
  });
  return [mapSide(summary.team1 || {}), mapSide(summary.team2 || {})];
}

// ---------------------------------------------------------------------------
// Match detail (cbzios /match/{id} — fixture-verified)
// ---------------------------------------------------------------------------

export function normalizeCbziosMatchDetail(summary) {
  const h = summary.header || {};
  const t1 = summary.team1 || {};
  const t2 = summary.team2 || {};
  return {
    matchId: str(summary.match_id),
    teams: `${t1.s_name || t1.name || ''} vs ${t2.s_name || t2.name || ''}`,
    team1: { id: str(t1.id), name: str(t1.name), short: str(t1.s_name) },
    team2: { id: str(t2.id), name: str(t2.name), short: str(t2.s_name) },
    series: { id: str(summary.series_id ?? ''), name: str(summary.series_name || '') },
    matchDesc: str(h.match_desc),
    format: str(h.type),
    state: str(h.state),
    stateTitle: str(h.state_title),
    status: str(h.status),
    toss: summary.toss
      ? { winner: str(summary.toss.winner), decision: str(summary.toss.decision) }
      : { winner: '', decision: str(h.toss) },
    startTime: h.start_time ? Number(h.start_time) * 1000 : null,
    endTime: h.end_time ? Number(h.end_time) * 1000 : null,
    venue: {
      ground: str(summary.venue?.name),
      city: str(summary.venue?.location),
      timezone: str(summary.venue?.timezone),
      lat: str(summary.venue?.lat),
      long: str(summary.venue?.long),
    },
    officials: {
      umpire1: summary.official?.umpire1 ? str(summary.official.umpire1.name) : '',
      umpire2: summary.official?.umpire2 ? str(summary.official.umpire2.name) : '',
      umpire3: summary.official?.umpire3 ? str(summary.official.umpire3.name) : '',
      referee: summary.official?.referee ? str(summary.official.referee.name) : '',
    },
    playerOfTheMatch: (h.momNames || []).map(str),
    source: 'cricbuzz-cbzios',
  };
}

// ---------------------------------------------------------------------------
// ESPNcricinfo: hs-consumer-api /v1/pages/matches/current
// Fixture-verified: { matches: [ { id, slug, stage, status, statusText,
//   title, startDate, endDate, ground, series, teams: [ { team, score, scoreInfo } ] } ] }
// ---------------------------------------------------------------------------

const HSCICDN = 'https://img1.hscicdn.com/image/upload/f_auto,t_ds_square_w_160,q_50/lsci';

export function normalizeCricinfoList(payload) {
  return (payload?.matches || []).map((m) => ({
    matchId: str(m.id),
    slug: str(m.slug),
    title: str(m.title),
    stage: str(m.stage),
    status: str(m.status),
    statusText: str(m.statusText),
    live: str(m.stage) === 'LIVE',
    startDate: m.startDate || null,
    endDate: m.endDate || null,
    series: { id: str(m.series?.id), name: str(m.series?.name || m.series?.longName) },
    venue: { ground: str(m.ground?.name), city: str(m.ground?.smallName) },
    teams: (m.teams || []).map((t) => ({
      name: str(t.team?.name),
      short: str(t.team?.abbreviation),
      score: str(t.score),
      scoreInfo: str(t.scoreInfo),
      image: t.team?.imageUrl ? `${HSCICDN}${t.team.imageUrl}` : '',
    })),
    source: 'espncricinfo',
  }));
}
