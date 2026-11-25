import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
process.env.DATA_MODE = 'fixtures';
const { createServer } = await import('../src/server.js');
let server, origin;
before(async () => { server = createServer(); await new Promise((r) => server.listen(0,'127.0.0.1',r)); origin = `http://127.0.0.1:${server.address().port}`; });
after(async () => { await new Promise((r) => server.close(r)); });
async function get(path) { const r = await fetch(origin + path); return { status: r.status, body: await r.json() }; }
for (const kind of ['live','recent','upcoming']) test(`ESPN ${kind} has classified matches and correct links`, async () => {
  const { status, body } = await get(`/espn/${kind}`);
  assert.equal(status,200); assert.ok(body.result.count > 0);
  for (const m of body.result.matches) {
    assert.equal(m.category,kind); assert.match(m.detail,/\/espn\/match\/.+\?league=\d+/);
    assert.ok(m.startDate >= Date.parse('2026-01-01'));
    assert.ok(m.scores.every((s) => s.score !== '0/0'));
  }
  assert.equal(body.meta.source.source,'fixture');
});
test('ESPN match and innings totals preserve venue, result and award', async () => {
  const { body, status } = await get('/espn/match/1525662?league=24484&date=20261119');
  assert.equal(status,200); const m = body.result.match;
  assert.match(m.venue.ground,/Wanderers/); assert.match(m.status,/won/);
  assert.deepEqual(m.playerOfTheMatch,['Kagiso Rabada']); assert.equal(m.scores.length,4);
  const sc = await get('/espn/match/1525662/scorecard?league=24484');
  assert.equal(sc.status,200); assert.match(sc.body.result.coverage,/totals only/);
});
test('ESPN standings normalizes numeric statistics', async () => {
  const { status, body } = await get('/espn/standings/20921');
  assert.equal(status,200); const entries = body.result.groups[0].entries;
  assert.equal(entries.length,6); assert.equal(entries[0].team.short,'GG');
  assert.equal(entries[0].stats.rank,1); assert.equal(entries[0].stats.matchPoints,4);
  assert.ok(!('Total' in entries[0].stats));
});
test('ESPN missing data and invalid parameters fail honestly', async () => {
  assert.equal((await get('/espn/standings/999')).status,404);
  assert.equal((await get('/espn/match/1525662')).status,400);
  assert.equal((await get('/espn/match/1525662?league=24484&date=bad')).status,400);
  assert.equal((await get('/espn/match/999?league=24484')).status,404);
  assert.equal((await get('/espn/match/1525662/squads?league=24484')).status,404);
});
