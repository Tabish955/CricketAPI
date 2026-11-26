// No network: exercise production-mode provider fallbacks with transport mocks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
process.env.DATA_MODE = 'auto';
const { getCricbuzzMatches, getScorecard, getCricinfoList } = await import('../src/providers.js');
const { cacheClear } = await import('../src/cache.js');
const originalFetch = globalThis.fetch;
const payload = JSON.parse(readFileSync(new URL('../fixtures/espn-live.json', import.meta.url)));
test('production chain: Cricbuzz → Cricinfo → ESPN; never uses offline recordings', async () => {
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).includes('site.api.espn.com')) return new Response(JSON.stringify(payload), { status: 200 });
    return new Response('{}', { status: 403 });
  };
  try {
    const r = await getCricbuzzMatches('live');
    assert.equal(r.meta.source,'live'); assert.equal(r.data.length,2);
    assert.match(calls[0],/cricbuzz/); assert.match(calls[1],/hs-consumer/); assert.match(calls[2],/site.api.espn/);
    assert.ok(r.data.every((m) => m.source === 'espn-site'));
    const ci = await getCricinfoList('current');
    assert.equal(ci.meta.source,'live'); assert.equal(ci.data.matches.length,2);
    await assert.rejects(getScorecard('53373'), /HTTP 403/, 'even an exact old fixture cannot leak into production');
  } finally { globalThis.fetch = originalFetch; }
});
test('all production providers failing returns an error, not 2025 fixture data', async () => {
  cacheClear();
  globalThis.fetch = async () => new Response('{}', { status: 503 });
  try { await assert.rejects(getCricbuzzMatches('recent'),/HTTP 503/); }
  finally { globalThis.fetch = originalFetch; }
});

test('shared ESPN header URL cannot cross-contaminate cached match categories', async () => {
  cacheClear();
  const { fetchEspnHeader } = await import('../src/espn.js');
  const captures = ['live', 'recent', 'upcoming'].map((kind) => JSON.parse(
    readFileSync(new URL(`../fixtures/espn-${kind}.json`, import.meta.url))));
  const mixed = { events: captures.flatMap((d) => d.events), leagues: captures[0].leagues };
  globalThis.fetch = async () => new Response(JSON.stringify(mixed), { status: 200 });
  try {
    // Parallel access also exercises single-flight cache keys.
    const kinds = ['live', 'recent', 'upcoming'];
    const results = await Promise.all(kinds.map(fetchEspnHeader));
    for (let i = 0; i < kinds.length; i++) {
      assert.ok(results[i].data.length > 0);
      assert.ok(results[i].data.every((m) => m.category === kinds[i]));
      const again = await fetchEspnHeader(kinds[i]);
      assert.equal(again.meta.cached, true);
      assert.deepEqual(again.data, results[i].data);
    }
    const all = await fetchEspnHeader();
    assert.equal(all.data.length, mixed.events.length, 'current list must not inherit a category filter');
  } finally { globalThis.fetch = originalFetch; cacheClear(); }
});

test('expanded ESPN HTTP routes return player innings and paginated commentary in production mode', async () => {
  cacheClear();
  const { createServer } = await import('../src/server.js');
  const server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const stats = { categories: [{ stats: [{ name:'inningsNumber', value:2 }, { name:'batted', value:1 }, { name:'runs', value:12 }, { name:'ballsFaced', value:6 }] }] };
  const summary = { rosters: [{ team: { id:'3' }, roster:[{ athlete: { id:'550215', displayName:'Player' }, linescores:[{ period:2, statistics:stats }] }] }] };
  summary.header = { competitions:[{ competitors:[{ team:{ id:'3' }, linescores:[{
    period:2, isBatting:true,
    statistics:{ categories:[{ stats:[{ name:'extras', value:'2' }, {name:'wides',value:'2'}] }] },
    fow:[{ wicketNumber:1, wicketOver:1.1, runs:1, athlete:{ id:'x', displayName:'Batter' } }],
    partnerships:[{ wicketNumber:1, runs:1, overs:1.1, batsmen:[] }],
  }] }] }] };
  const board = JSON.parse(readFileSync(new URL('../fixtures/espn-recent.json', import.meta.url)));
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    if (String(url).startsWith(origin)) return originalFetch(url, opts);
    calls.push(String(url));
    if (String(url).includes('/summary?')) return new Response(JSON.stringify(summary));
    if (String(url).includes('/playbyplay?')) return new Response(JSON.stringify({ commentary: { pageIndex:2, count:1, pageCount:2, items:[{ shortText:'One run', innings:{ runs:65, totalRuns:1, wickets:0 } }] } }));
    return new Response(JSON.stringify(board));
  };
  try {
    const sc = await (await fetch(`${origin}/espn/match/1525662/scorecard?league=24484&date=20261119`)).json();
    assert.equal(sc.result.innings.find((i) => i.inningsId === 2).batsmen[0].runs,12);
    assert.equal(sc.meta.source.playerStatistics.source,'live');
    const inn = sc.result.innings.find((i) => i.inningsId === 2);
    assert.equal(inn.extras.total,2);
    assert.equal(inn.fallOfWickets[0].batsman.name,'Batter');
    assert.equal(inn.partnerships[0].runs,1);
    const commentary = await (await fetch(`${origin}/espn/match/1525662/commentary?league=24484&page=2`)).json();
    assert.equal(commentary.result.page,2); assert.equal(commentary.result.commentary[0].score,'65/0');
    assert.ok(calls.some((u) => u.includes('page=2')));
    assert.equal((await fetch(`${origin}/espn/match/1525662/commentary?league=24484&page=0`)).status,400);
    assert.equal((await fetch(`${origin}/espn/match/1525662/commentary`)).status,400);
  } finally {
    globalThis.fetch = originalFetch; cacheClear(); await new Promise((r) => server.close(r));
  }
});

test('independent CREX source is used when Cricbuzz, Cricinfo and ESPN fail', async () => {
  cacheClear();
  const calls = [];
  const html = `<a class="match-card-wrapper" href="/cricket-live-score/a-vs-b-match-updates-123A"><div class="team-info"><span class="team-name">A</span><span class="team-score">10/1</span></div><div class="result"><span>Live</span></div><div class="team-info"><span class="team-name">B</span></div></a>`;
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return String(url).startsWith('https://crex.com/') ? new Response(html) : new Response('{}', { status:503 });
  };
  try {
    const r = await getCricbuzzMatches('live');
    assert.equal(r.data[0].source,'crex'); assert.equal(r.meta.source,'live');
    assert.equal(r.meta.upstreamErrors.length,3);
    assert.deepEqual(calls.map((u) => new URL(u).hostname), ['www.cricbuzz.com','hs-consumer-api.espncricinfo.com','site.api.espn.com','crex.com']);
  } finally { globalThis.fetch = originalFetch; cacheClear(); }
});

test('Sportskeeda HTTP standings route uses its own fixed origin, cache and provenance', async () => {
  cacheClear();
  const { createServer } = await import('../src/server.js');
  const server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    if (String(url).startsWith(origin)) return originalFetch(url, opts);
    calls.push(String(url));
    return new Response('<h1>Table</h1><table><tr><th>Pos</th><th>Teams</th><th>P</th><th>PTS</th></tr><tr><td>1</td><td>A</td><td>1</td><td>2</td></tr></table>');
  };
  try {
    const r = await (await fetch(`${origin}/sportskeeda/series/syed-mushtaq-ali-trophy/points-table`)).json();
    assert.equal(r.result.groups[0].entries[0].stats.matchPoints,2);
    assert.equal(r.result.seasonVerified,false);
    assert.equal(r.meta.source.source,'live');
    assert.deepEqual(calls,['https://www.sportskeeda.com/go/syed-mushtaq-ali-trophy/points-table']);
    const again = await (await fetch(`${origin}/sportskeeda/series/syed-mushtaq-ali-trophy/points-table`)).json();
    assert.equal(again.meta.source.cached,true);
  } finally { globalThis.fetch = originalFetch; cacheClear(); await new Promise((r) => server.close(r)); }
});
