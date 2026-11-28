import { playerRole } from './espn-detail.js';
import { DATA_MODE, TTL } from './config.js';
import { fetchJson, fetchText, UpstreamError } from './http.js';
import { cached } from './cache.js';
import { resolveFixture } from './fixtures.js';
import { parseProfileHtml } from './providers.js';
import { playerProfileLinks } from './player-profile-links.js';

const clean = (v) => typeof v === 'string' && v.trim() ? v.trim() : null;
const sameName = (a, b) => a?.toLowerCase().replace(/\s+/g, ' ').trim() === b.toLowerCase();
const pad = (v) => String(v).padStart(2, '0');
export function espnBirthDate(v) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v || '');
  return m ? `${m[3]}-${pad(m[2])}-${pad(m[1])}` : null;
}
export function cricbuzzBirthDate(v) {
  const m = /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s*(\d{4})\b/i.exec(v || '');
  if (!m) return null;
  const month = ['january','february','march','april','may','june','july','august','september','october','november','december'].indexOf(m[1].toLowerCase()) + 1;
  return `${m[3]}-${pad(month)}-${pad(m[2])}`;
}

export function normalizeEspnPlayer(raw, id) {
  const a = raw?.athlete;
  // Ignore switcher athletes and never accept a different identity/sport.
  if (!a || String(a.id) !== String(id) || a.type !== 'cricket' || !clean(a.displayName)) {
    throw new UpstreamError('upstream player identity could not be verified', { status: 502 });
  }
  const style = (v) => Array.isArray(v) ? v.map((s) => clean(s.description)).filter(Boolean).join(', ') || null : null;
  return {
    provider: 'espn', playerId: String(id), found: true,
    name: clean(a.displayName), shortName: clean(a.shortName),
    personalInfo: { born: clean(a.displayDOB), birthDate: espnBirthDate(a.displayDOB),
      role: playerRole(a.position?.name), battingStyle: style(a.batStyle), bowlingStyle: style(a.bowlStyle) },
    // Team is provider-published membership, not inferred nationality.
    team: a.team?.id ? { id: String(a.team.id), name: clean(a.team.displayName) } : null,
    imageUrl: null, biography: null, careerStats: { batting: null, bowling: null },
    profileUrl: `https://www.cricinfo.com/ci/content/player/${id}.html`,
    careerSourceUrl: null, careerProvider: null, careerPlayerId: null,
    careerUpdatedAt: null,
    careerCoverage: 'No reviewed cross-provider profile link is available for this player.',
  };
}

export function attachReviewedCareer(player, cb, link) {
  const allowed = (name) => link.names.some((n) => sameName(name, n));
  if (!allowed(player.name) && !allowed(player.shortName)) return false;
  if (!cb.found || String(cb.playerId) !== link.cricbuzzId || !allowed(cb.name)
      || player.personalInfo.birthDate !== link.born || cricbuzzBirthDate(cb.personalInfo?.born) !== link.born) return false;
  player.biography = cb.biography;
  player.careerStats = cb.careerStats;
  player.careerSourceUrl = link.url;
  player.careerProvider = 'cricbuzz';
  player.careerPlayerId = link.cricbuzzId;
  player.careerCoverage = 'Provider-published career coverage; totals may lag recent matches. Retrieval time is not the statistics update date.';
  return true;
}

/** Injectable reads let tests verify failure behavior without hitting live sources. */
export async function loadEspnPlayer(id, { readAthlete, readCareer } = {}) {
  const url = `https://site.web.api.espn.com/apis/common/v3/sports/cricket/200/athletes/${id}`;
  const raw = await (readAthlete ? readAthlete(url) : fetchJson(url, { retries: 0 }).then((r) => r.json));
  const player = normalizeEspnPlayer(raw, id);
  const link = playerProfileLinks[id];
  if (link) {
    try {
      const cb = readCareer ? await readCareer(link) : parseProfileHtml((await fetchText(link.url, { retries: 0 })).text, link.cricbuzzId);
      if (!attachReviewedCareer(player, cb, link)) player.careerCoverage = 'Career profile identity checks did not pass; no career data has been imported.';
    } catch {
      // A career-provider outage must not hide the valid ESPN personal profile.
      player.careerCoverage = 'The career provider is temporarily unavailable. Personal details are from ESPN.';
    }
  }
  return { data: player, meta: { source: 'live', upstream: url, fetchedAt: new Date().toISOString(), cached: false } };
}

export async function getEspnPlayer(id) {
  if (!/^[1-9]\d{0,11}$/.test(id)) throw new UpstreamError('invalid ESPN player ID', { status: 400 });
  if (DATA_MODE === 'fixtures') {
    const fx = resolveFixture('espn.player', id);
    if (!fx) { const e = new UpstreamError('no fixture recorded for espn.player', { status: 404 }); e.code = 'NO_FIXTURE'; throw e; }
    const data = normalizeEspnPlayer(fx.data, id);
    data.careerCoverage = 'This offline fixture records personal details only; no career data is substituted.';
    return { data, meta: { source: 'fixture', fixtureFile: fx.file, cached: false } };
  }
  return cached(`espn:player:${id}`, Math.min(TTL.playerProfile, 3600), () => loadEspnPlayer(id));
}
