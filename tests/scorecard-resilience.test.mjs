import test from 'node:test';
import assert from 'node:assert/strict';
import { getEspnMatch, mergeEspnScorecardInnings } from '../src/espn.js';
import { UpstreamError } from '../src/http.js';
const summary = (id) => ({ data: { header: { id, competitions: [{ competitors: [
  { team: { id: '1328788', displayName: 'MI Emirates', abbreviation: 'MIE' }, linescores: [{ period: 1, runs: 186, wickets: 4, overs: 20, isBatting: true }] },
  { team: { id: '1346066', displayName: 'Desert Vipers', abbreviation: 'DV' }, linescores: [{ period: 2, runs: 186, wickets: 8, overs: 20, isBatting: true }] },
] }] } }, meta: { source: 'live', upstream: 'summary' } });
test('scoreboard outage still serves exact-event summary and innings totals', async () => {
  const r = await getEspnMatch('1557442', '1557451', '20261128', false, {
    series: async () => { throw new UpstreamError('scoreboard unavailable', { status: 503 }); },
    summary: async () => summary('1557451'),
  });
  assert.equal(r.data.matchId, '1557451');
  assert.equal(r.data.scores.length, 2);
  assert.equal(r.meta.detail.source, 'live');
  assert.equal(r.meta.source, 'live');
  assert.equal(r.meta.scoreboard.source, 'unavailable');
});
test('scoreboard outage never substitutes a different summary event', async () => {
  await assert.rejects(getEspnMatch('1557442', '1557451', undefined, false, {
    series: async () => { throw new UpstreamError('down'); }, summary: async () => summary('999'),
  }), /not found/);
});
test('summary innings not present in scoreboard totals are retained without fabricated zero scores', () => {
  const rows = [{ inningsId: 1, team: 'MIE', batsmen: [{ id: '300631', runs: 76 }], bowlers: [] }, { inningsId: 2, batsmen: [], bowlers: [{ id: '1', wickets: 0 }] }];
  const r = mergeEspnScorecardInnings([], rows, []);
  assert.equal(r.length, 2);
  assert.equal(r[0].batsmen[0].runs, 76);
  assert.equal(r[1].bowlers[0].wickets, 0);
  assert.equal(r[0].score, undefined);
  assert.equal(r[0].extras, null);
  const withTotals = mergeEspnScorecardInnings([{ inningsId: 1, score: '186/4', teamId: '1328788' }], rows, []);
  assert.equal(withTotals[0].score, '186/4');
  assert.equal(withTotals.length, 2);
});
