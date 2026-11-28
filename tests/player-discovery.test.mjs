import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverCricbuzzProfile, searchCricbuzzPlayers } from '../src/player-discovery.js';
import { loadEspnPlayer } from '../src/espn-player.js';
import { parseProfileHtml } from '../src/providers.js';
import { profilePublishedIdentity } from '../src/player-career.js';
import { cacheClear } from '../src/cache.js';

const player = { name: 'Abhishek Sharma', shortName: 'Abhishek Sharma', personalInfo: { birthDate: '2000-09-04' } };
const hit = { id: '12086', name: player.name, dob: '2000-09-04' };
const rows = (data) => async () => ({ data });
const athlete = (overrides = {}) => async () => ({ athlete: { id: '1070183', type: 'cricket', displayName: player.name, shortName: player.name, displayDOB: '4/9/2000', ...overrides } });
const html = (id = '12086', name = player.name, born = 'September 04, 2000') => `<html><head><title>${name} Profile - Career</title><link rel="canonical" href="https://www.cricbuzz.com/profiles/${id}/player"></head><body><div>Born</div><div>${born}</div><div id="player-bio">Synthetic test biography.</div><h2>Batting Career Summary</h2><table><tr><th></th><th>Matches</th></tr><tr><td>T20</td><td>0</td></tr></table></body></html>`;

test('same-name players require exact full DOB; duplicate identical hits deduplicate', async () => {
  const r = await discoverCricbuzzProfile(player, rows([hit, hit, { ...hit, id: '12975', dob: 'N/A' }, { ...hit, id: '1483861', dob: '2001-01-02' }]));
  assert.equal(r.link.cricbuzzId, '12086');
  assert.equal(r.link.url, 'https://www.cricbuzz.com/profiles/12086/player');
  assert.equal((await discoverCricbuzzProfile(player, rows([hit, { ...hit, id: '222' }]))).status, 'ambiguous');
});
test('no name-only, fuzzy, missing-DOB or invalid-ID matches', async () => {
  for (const h of [{ ...hit, dob: null }, { ...hit, name: 'A Sharma' }, { ...hit, id: '../12086' }, { ...hit, dob: '2001-09-04' }]) {
    assert.equal((await discoverCricbuzzProfile(player, rows([h]))).status, 'no_match');
  }
  assert.equal((await discoverCricbuzzProfile({ ...player, personalInfo: {} }, () => assert.fail('no DOB, no search'))).status, 'identity_unavailable');
});
test('at most two published-name searches; different alias results must agree', async () => {
  const queries = [];
  const p = { ...player, name: 'Abhishek Full Sharma' };
  const r = await discoverCricbuzzProfile(p, async (query) => { queries.push(query); return { data: [query === p.name ? { ...hit, id: '999', name: p.name } : hit] }; });
  assert.deepEqual(queries, ['Abhishek Sharma', 'Abhishek Full Sharma']);
  assert.equal(r.status, 'ambiguous');
});
test('unlisted player integration imports parsed biography and partial tables with independent profile identity', async () => {
  const result = await loadEspnPlayer('1070183', { readPortrait: async () => ({ valid: false }), readAthlete: athlete(), searchPlayers: rows([hit]), readCareer: async () => parseProfileHtml(html(), '12086') });
  assert.equal(result.data.careerPlayerId, '12086');
  assert.equal(result.data.biography, 'Synthetic test biography.');
  assert.equal(result.data.careerStats.batting.formats[0].statistics.Matches, '0');
  assert.equal(result.data.careerStats.bowling, null);
  assert.equal(result.data.playerId, '1070183');
  assert.equal(result.data.careerUpdatedAt, null);
});
test('wrong redirect, missing canonical, wrong profile name/DOB never attach data', async () => {
  for (const doc of [html('999'), html().replace(/<link[^>]+>/, ''), html('12086', 'Wrong Person'), html('12086', player.name, 'September 05, 2000')]) {
    const { data } = await loadEspnPlayer('1070183', { readPortrait: async () => ({ valid: false }), readAthlete: athlete(), searchPlayers: rows([hit]), readCareer: async () => parseProfileHtml(doc, '12086') });
    assert.equal(data.biography, null);
    assert.equal(data.careerPlayerId, null);
    assert.match(data.careerCoverage, /identity checks/);
  }
  assert.equal(profilePublishedIdentity('<link rel="canonical" href="https://evil.example/profiles/12086/player">'), null);
});
test('women and arbitrary provider IDs use the same generic pipeline', async () => {
  const { data } = await loadEspnPlayer('1070183', {
    readPortrait: async () => ({ valid: false }),
    readAthlete: athlete({ displayName: 'Smriti Shriniwas Mandhana', shortName: 'Smriti Mandhana', displayDOB: '18/7/1996' }),
    searchPlayers: rows([{ id: '10012', name: 'Smriti Mandhana', dob: '1996-07-18' }]),
    readCareer: async () => parseProfileHtml(html('10012', 'Smriti Mandhana', 'July 18, 1996'), '10012'),
  });
  assert.equal(data.careerPlayerId, '10012');
});
test('unlisted no-match, ambiguity, missing identity and upstream failures preserve personal profile', async () => {
  for (const [searchPlayers, expected] of [[rows([]), /No matching/], [rows([hit, { ...hit, id: '222' }]), /Multiple/], [async () => { throw Error('down'); }, /temporarily/]]) {
    const { data } = await loadEspnPlayer('1070183', { readPortrait: async () => ({ valid: false }), readAthlete: athlete(), searchPlayers, readCareer: () => assert.fail('no fetch') });
    assert.equal(data.name, player.name);
    assert.equal(data.biography, null);
    assert.match(data.careerCoverage, expected);
  }
  const { data } = await loadEspnPlayer('1070183', { readPortrait: async () => ({ valid: false }), readAthlete: athlete({ displayDOB: null }), searchPlayers: () => assert.fail('no search') });
  assert.match(data.careerCoverage, /birth date/);
});
test('autocomplete transport accepts observed no-hit shape, rejects malformed payload and caches', async () => {
  const original = globalThis.fetch;
  try {
    let calls = 0;
    globalThis.fetch = async (url) => { calls++; assert.match(url, /api\/player-search\/Abhishek%20Sharma$/); return new Response(JSON.stringify({ player: [hit] })); };
    cacheClear();
    assert.equal((await searchCricbuzzPlayers(player.name)).data[0].id, '12086');
    await searchCricbuzzPlayers(player.name);
    assert.equal(calls, 1);
    for (const [payload, valid] of [[{ category: 'none' }, true], [{ player: 'oops' }, false], [{ error: 'rate limited' }, false]]) {
      cacheClear(); globalThis.fetch = async () => new Response(JSON.stringify(payload));
      if (valid) assert.deepEqual((await searchCricbuzzPlayers('none')).data, []);
      else await assert.rejects(searchCricbuzzPlayers('none'), /invalid player-search/);
    }
  } finally { globalThis.fetch = original; cacheClear(); }
});
