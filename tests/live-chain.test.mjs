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
