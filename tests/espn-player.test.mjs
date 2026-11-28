import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeEspnPlayer, attachReviewedCareer, loadEspnPlayer, espnBirthDate, cricbuzzBirthDate } from '../src/espn-player.js';
import { playerProfileLinks } from '../src/player-profile-links.js';
import handler from '../api/index.js';

const raw = JSON.parse(readFileSync(new URL('../fixtures/espn-player-253802.json', import.meta.url)));
const cb = () => ({ playerId: '1413', publishedPlayerId: '1413', name: 'Virat Kohli', found: true, personalInfo: { born: 'November 05, 1988 (38 years)' }, biography: 'Synthetic biography for identity tests.', careerStats: { batting: { title: 'Batting Career Summary', formats: [{ format: 'Test', statistics: { Matches: '0', Highest: null } }] }, bowling: null } });

test('profile rejects different/missing athlete ID and other sports; no switcher fallback', () => {
  for (const r of [{}, { athlete: { ...raw.athlete, id: '1' } }, { athlete: { ...raw.athlete, type: 'soccer' } }, { playerSwitcher: { athletes: [raw.athlete] } }]) assert.throws(() => normalizeEspnPlayer(r, '253802'), /identity/);
});
test('ESPN personal profile omits unvalidated images and does not label team as nationality', () => {
  const p = normalizeEspnPlayer(raw, '253802');
  assert.equal(p.personalInfo.birthDate, '1988-11-05');
  assert.equal(p.imageUrl, null);
  assert.equal(p.biography, null);
  assert.equal(p.team.id, '6');
  assert.equal('country' in p, false);
  assert.equal(normalizeEspnPlayer({ athlete: { ...raw.athlete, position: { name: 'Unknown' } } }, '253802').personalInfo.role, null);
  assert.equal(espnBirthDate('November 5, 1988'), null);
  assert.equal(cricbuzzBirthDate('November 05, 1988 (38 years)'), '1988-11-05');
});
test('reviewed links still require runtime names, both DOBs and exact Cricbuzz ID', () => {
  const link = playerProfileLinks['253802'];
  for (const altered of [{ ...cb(), playerId: '253802' }, { ...cb(), name: 'Other Player' }, { ...cb(), personalInfo: { born: 'November 06, 1988' } }, { ...cb(), found: false }]) {
    const p = normalizeEspnPlayer(raw, '253802');
    assert.equal(attachReviewedCareer(p, altered, link), false);
    assert.equal(p.biography, null);
  }
  const p = normalizeEspnPlayer(raw, '253802');
  p.personalInfo.birthDate = null;
  assert.equal(attachReviewedCareer(p, cb(), link), false);
  const good = normalizeEspnPlayer(raw, '253802');
  assert.equal(attachReviewedCareer(good, cb(), link), true);
  assert.equal(good.playerId, '253802');
  assert.equal(good.careerPlayerId, '1413');
  assert.equal(good.careerUpdatedAt, null);
  assert.equal(good.careerStats.batting.formats[0].statistics.Matches, '0');
});
test('career outage or mismatch leaves valid ESPN identity available', async () => {
  const outage = await loadEspnPlayer('253802', { readPortrait: async () => ({ valid: false }), readAthlete: async () => raw, readCareer: async () => { throw new Error('upstream down'); } });
  assert.equal(outage.data.name, 'Virat Kohli');
  assert.equal(outage.data.biography, null);
  assert.match(outage.data.careerCoverage, /temporarily/);
  const mismatch = await loadEspnPlayer('253802', { readPortrait: async () => ({ valid: false }), readAthlete: async () => raw, readCareer: async () => ({ ...cb(), name: 'Wrong' }) });
  assert.equal(mismatch.data.careerSourceUrl, null);
  assert.match(mismatch.data.careerCoverage, /identity checks/);
});
test('players outside the reviewed list discover a provider-local ID, never guess it', async () => {
  const result = await loadEspnPlayer('999', {
    readPortrait: async () => ({ valid: false }),
    readAthlete: async () => ({ athlete: { ...raw.athlete, id: '999' } }),
    searchPlayers: async () => ({ data: [{ id: '1413', name: 'Virat Kohli', dob: '1988-11-05' }] }),
    readCareer: async (link) => { assert.equal(link.cricbuzzId, '1413'); return cb(); },
  });
  assert.equal(result.data.playerId, '999');
  assert.equal(result.data.careerPlayerId, '1413');
  assert.ok(result.data.biography);
});
test('HTTP profile fixture uses exact ID, no-store and nullable career, never generic substitution', async () => {
  async function call(url) {
    const r = { writeHead(status, headers) { this.status = status; this.headers = headers; }, end(body) { this.body = JSON.parse(body); } };
    await handler({ method: 'GET', url, headers: { host: 'example.test' } }, r);
    return r;
  }
  const good = await call('/espn/player/253802');
  assert.equal(good.status, 200);
  assert.equal(good.headers['Cache-Control'], 'no-store');
  assert.equal(good.body.result.player.playerId, '253802');
  assert.equal(good.body.result.player.biography, null);
  assert.equal(good.body.meta.source.source, 'fixture');
  const missing = await call('/espn/player/277906');
  assert.notEqual(missing.status, 200);
  const invalid = await call('/espn/player/0');
  assert.equal(invalid.status, 404);
});
