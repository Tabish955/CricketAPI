import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectPortrait, portraitCandidate, verifiedPlayerPortrait } from '../src/player-portrait.js';
import { cacheClear } from '../src/cache.js';
import { loadEspnPlayer } from '../src/espn-player.js';
const url = 'https://a.espncdn.com/i/headshots/cricket/players/full/123.png';
const raw = () => ({ athlete: { id: '123', type: 'cricket', displayName: 'Synthetic Player', displayDOB: '1/1/2000', headshot: { href: url, rel: ['full'] } } });
test('portrait is provider-published and exact ID-bound; no placeholders or URL guessing', () => {
  assert.equal(portraitCandidate(raw(), '123'), url);
  for (const href of [url.replace('/123.', '/124.'), url.replace('https:', 'http:'), url + '?x=1', 'https://evil.test/123.png', 'https://a.espncdn.com/i/headshots/cricket/players/default-player-logo-500.png']) {
    const r = raw(); r.athlete.headshot.href = href;
    assert.equal(portraitCandidate(r, '123'), null);
  }
  const r = raw(); r.athlete.headshot.rel.push('default');
  assert.equal(portraitCandidate(r, '123'), url); // 'default' means primary, not necessarily placeholder
  assert.equal(portraitCandidate(raw(), '124'), null);
});
test('measured portrait GET rejects empty/oversize/nonimage/error/network; boundary accepted', async () => {
  for (const [status, mime, bytes, valid] of [[200, 'image/png', 1, true], [200, 'image/png', 204800, true], [200, 'image/png', 204801, false], [200, 'image/png', 0, false], [200, 'text/html', 1, false], [404, 'image/png', 1, false]]) {
    const result = await inspectPortrait(url, async (_, options) => { assert.equal(options.redirect, 'error'); return new Response(new Uint8Array(bytes), { status, headers: { 'content-type': mime } }); });
    assert.equal(result.valid, valid);
  }
  assert.equal((await inspectPortrait(url, async () => { throw Error('network'); })).valid, false);
});
test('transport validation cached; invalid portrait remains null', async () => {
  cacheClear(); let calls = 0;
  const inspect = async () => { calls++; return { valid: true, status: 200, mime: 'image/png', bytes: 100 }; };
  assert.equal(await verifiedPlayerPortrait(raw(), '123', inspect), url);
  assert.equal(await verifiedPlayerPortrait(raw(), '123', inspect), url);
  assert.equal(calls, 1);
  cacheClear();
  assert.equal(await verifiedPlayerPortrait(raw(), '123', async () => ({ valid: false })), null);
  cacheClear();
});
test('valid portrait survives independent career outage; invalid photo does not hide profile', async () => {
  for (const valid of [true, false]) {
    cacheClear();
    const { data } = await loadEspnPlayer('123', { readAthlete: async () => raw(), readPortrait: async () => ({ valid }), searchPlayers: async () => { throw Error('down'); } });
    assert.equal(data.imageUrl, valid ? url : null);
    assert.equal(data.name, 'Synthetic Player');
    assert.equal(data.biography, null);
    assert.match(data.careerCoverage, /temporarily/);
  }
  cacheClear();
});

test('Cricbuzz fallback requires labelled portrait and independently verified profile identity', async () => {
  const { profilePortraitCandidate } = await import('../src/player-career.js');
  const { verifiedCricbuzzPortrait } = await import('../src/player-portrait.js');
  const photo = 'https://static.cricbuzz.com/a/img/v1/i1/c582022/i.jpg?d=high&p=det';
  const doc = `<img alt="Team" src="https://static.cricbuzz.com/a/img/v1/i1/c1/i.jpg"><img alt="synthetic-player" src="${photo.replaceAll('&', '&amp;')}">`;
  assert.equal(profilePortraitCandidate(doc, 'Synthetic Player'), photo);
  assert.equal(profilePortraitCandidate(doc, 'Someone Else'), null);
  const cb = { found: true, playerId: '456', publishedPlayerId: '456', portraitCandidate: photo };
  cacheClear();
  assert.equal(await verifiedCricbuzzPortrait(cb, '456', async () => ({ valid: true })), photo);
  assert.equal(await verifiedCricbuzzPortrait({ ...cb, publishedPlayerId: '999' }, '456', () => assert.fail()), null);
  assert.equal(await verifiedCricbuzzPortrait({ ...cb, portraitCandidate: 'https://evil.test/a.png' }, '456', () => assert.fail()), null);
  cacheClear();
});
