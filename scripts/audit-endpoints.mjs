// Re-run before the presentation from a network-enabled machine.
// node scripts/audit-endpoints.mjs --out=endpoint-audit.json
// node scripts/audit-endpoints.mjs --fixtures --out=offline-audit.json
// Offline fixtures are NOT evidence of production availability.
import { writeFile } from 'node:fs/promises';
const fixtureMode = process.argv.includes('--fixtures');
let server;
let base = process.env.API_BASE || 'https://cricketapi-beryl.vercel.app';
if (fixtureMode) {
  process.env.DATA_MODE = 'fixtures';
  const { createServer } = await import('../src/server.js');
  server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
}
const probes = [];
async function probe(path, method = 'GET') {
  const started = Date.now();
  try {
    const response = await fetch(new URL(path, base), { method, signal: AbortSignal.timeout(45000) });
    const type = response.headers.get('content-type') || '';
    const body = type.includes('json') ? await response.json() : null;
    if (!body) await response.arrayBuffer();
    const row = { method, path, status: response.status, ms: Date.now()-started,
      ok: response.ok, success: body?.success ?? null,
      count: body?.result?.count ?? null, contentType: type,
      cors: response.headers.get('access-control-allow-origin'),
      meta: body?.meta, error: body?.error ?? null };
    probes.push(row);
    return body;
  } catch (e) {
    probes.push({ method, path, status: null, ok: false, ms: Date.now()-started, error: e.message });
    return null;
  }
}
try {
  const root = await probe('/');
  const recent = await probe('/espn/recent');
  const selected = recent?.result?.matches?.find((m) => m.detail?.includes('/espn/'));
  // Examples below are explicit only when discovery is unavailable.
  const id = selected?.matchId || (fixtureMode ? '1525662' : '1546783');
  const league = selected?.seriesId || (fixtureMode ? '24484' : '8661');
  const date = selected?.startDate ? new Date(selected.startDate).toISOString().slice(0,10).replaceAll('-','') : (fixtureMode ? '20261119' : '20261126');
  const cb = fixtureMode ? '20717' : '165221';
  const q = `league=${league}&date=${date}`;
  const paths = [
    '/index.json', '/health', '/sources/status',
    '/cb/live', '/cb/recent', '/cb/upcoming', '/cb/search?q=Mumbai',
    `/cb/match/${cb}`, `/cb/match/${fixtureMode ? '53373' : cb}/scorecard`,
    `/cb/match/${cb}/commentary?page=0`, `/cb/match/${cb}/squads`,
    '/cb/player/name?q=Virat%20Kohli', '/cb/player/265',
    '/cb/series/12420/matches', '/cb/series/12037/points-table',
    '/cricinfo/current', '/cricinfo/live', '/cricinfo/scheduled?date=26-11-2026',
    '/cricinfo/result?date=26-11-2026', '/cricinfo/match/1546783?seriesId=1546522',
    '/espn/live', '/espn/upcoming',
    '/sportskeeda/series/syed-mushtaq-ali-trophy/points-table',
    `/espn/match/${id}?${q}`, `/espn/match/${id}/scorecard?${q}`,
    `/espn/match/${id}/squads?${q}`, `/espn/match/${id}/commentary?league=${league}&page=2`,
    `/espn/series/${league}/matches?date=${date}`, '/espn/standings/20921',
    '/crex/live', '/crex/recent', '/crex/upcoming',
    '/img?u=https%3A%2F%2Fa.espncdn.com%2Fi%2Fteamlogos%2Fcricket%2F500%2F1603.png',
  ];
  // Bounded concurrency: avoid a cold-start burst against public providers.
  for (let i=0; i<paths.length; i+=3) await Promise.all(paths.slice(i,i+3).map((p) => probe(p)));
  const validation = [
    ['/cb/search', 400], ['/espn/match/1', 400],
    ['/espn/match/1?league=8661&date=bad',400],
    ['/espn/match/1/commentary?league=8661&page=0',400],
    ['/img',400], ['/img?u=https://evil.example/test.png',403], ['/not-a-route',404],
  ];
  for (const [path, expected] of validation) { await probe(path); probes.at(-1).expected = expected; probes.at(-1).validationPassed = probes.at(-1).status === expected; }
  await probe('/health','OPTIONS'); probes.at(-1).expected = 204;
  await probe('/health','POST'); probes.at(-1).expected = 405;
  const report = { checkedAt: new Date().toISOString(), base, mode: fixtureMode ? 'offline-fixtures' : 'deployed',
    note: 'HTTP success alone does not prove data completeness or freshness. Review meta.source, coverage, values and browser images. Static historical examples remain if discovery fails.',
    discoveredEndpointEntries: root?.endpoints?.length ?? null, sampledMatch: { id,league,date }, probes };
  const output = JSON.stringify(report, null, 2);
  const out = process.argv.find((a) => a.startsWith('--out='))?.slice(6);
  if (out) await writeFile(out, output+'\n');
  console.log(output);
} finally { if (server) await new Promise((r) => server.close(r)); }
