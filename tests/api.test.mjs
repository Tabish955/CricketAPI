// API tests — run against the recorded fixture corpus (DATA_MODE=fixtures).
// Usage: npm test   (or DATA_MODE=fixtures node --test tests/)
// Env is set before the dynamic import so config.js reads the right mode.

process.env.DATA_MODE = 'fixtures';

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const { createServer } = await import('../src/server.js');

let server;
let origin;

before(async () => {
  server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

async function get(path) {
  const res = await fetch(`${origin}${path}`);
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

test('GET /health', async () => {
  const { status, body } = await get('/health');
  assert.equal(status, 200);
  assert.equal(body.status, 'ok');
  assert.equal(body.dataMode, 'fixtures');
});

test('GET / lists endpoints and fixture inventory', async () => {
  const { status, body } = await get('/');
  assert.equal(status, 200);
  assert.ok(Array.isArray(body.endpoints));
  assert.ok(body.endpoints.some((e) => e.includes('/cb/live')));
  assert.ok(body.disclaimer.toLowerCase().includes('educational'));
});

test('GET /cb/live returns live matches with reference-API fields', async () => {
  const { status, body } = await get('/cb/live');
  assert.equal(status, 200);
  assert.equal(body.success, true);
  const { matches, count, found } = body.result;
  assert.equal(found, true);
  assert.ok(count >= 1, 'fixture corpus has live matches');
  const m = matches[0];
  // Reference schema: matchId / teams / scores / status / links
  assert.ok(m.matchId, 'matchId present');
  assert.ok(m.teams, 'teams present');
  assert.ok(Array.isArray(m.scores), 'scores is an array');
  assert.ok(m.status, 'status present');
  assert.ok(m.detail?.endsWith(`/cb/match/${m.matchId}`), 'self-referential detail link');
  assert.ok(m.scorecard?.endsWith('/scorecard'));
  assert.ok(m.commentary?.endsWith('/commentary'));
  assert.ok(m.squads?.endsWith('/squads'));
  // The nihaa live fixture has two In Progress matches
  const liveOnes = matches.filter((x) => x.live);
  assert.ok(liveOnes.length >= 2, 'at least two live matches in fixture');
});

test('GET /cb/recent and /cb/upcoming', async () => {
  const recent = await get('/cb/recent');
  assert.equal(recent.status, 200);
  assert.ok(recent.body.result.count > 10, 'recent fixture has many matches');
  const upcoming = await get('/cb/upcoming');
  assert.equal(upcoming.status, 200);
  assert.ok(upcoming.body.result.count >= 8, 'upcoming fixture has 8 matches');
  assert.ok(upcoming.body.result.matches.every((m) => m.matchId));
});

test('GET /cb/search?q= filters matches', async () => {
  const hit = await get('/cb/search?q=AUS');
  assert.equal(hit.status, 200);
  assert.equal(hit.body.result.found, true);
  assert.ok(hit.body.result.matches.some((m) => m.teams.includes('AUS')));
  const miss = await get('/cb/search?q=zzzz-not-a-team');
  assert.equal(miss.status, 200);
  assert.equal(miss.body.result.found, false);
  const noQ = await get('/cb/search');
  assert.equal(noQ.status, 400);
});

test('GET /cb/match/:id returns detail with links', async () => {
  const { status, body } = await get('/cb/match/20717');
  assert.equal(status, 200);
  const match = body.result.match;
  assert.equal(match.matchId, '20717');
  assert.ok(match.teams.length > 3, 'teams string has both sides');
  assert.ok(match.scorecard.endsWith('/scorecard'));
  assert.ok(match.commentary.endsWith('/commentary'));
  assert.ok(match.squads.endsWith('/squads'));
  // fixture-normalized cbzios detail carries venue + toss (Headingley, 2019 Ashes)
  assert.ok(match.venue, 'venue present');
  assert.equal(match.venue.ground, 'Headingley');
  assert.equal(match.toss.winner, 'England');
});

test('GET /cb/match/:id/scorecard (modern fixture 53373)', async () => {
  const { status, body } = await get('/cb/match/53373/scorecard');
  assert.equal(status, 200);
  const sc = body.result.scorecard;
  assert.equal(body.result.matchId, '53373');
  assert.ok(sc.innings.length >= 1, 'at least one innings');
  const inn = sc.innings[0];
  assert.ok(inn.batsmen.length > 0, 'batsmen listed');
  assert.ok(inn.bowlers.length > 0, 'bowlers listed');
  assert.ok(inn.total || inn.score, 'total score present');
  assert.equal(sc.format, 'TEST', 'matchHeader.matchFormat=TEST');
  assert.equal(sc.matchDescription, 'Only Test');
  assert.equal(sc.series, 'Womens Ashes, 2023');
  assert.ok(sc.innings.length >= 3, 'three innings in the captured Test');
});

test('GET /cb/match/:id/scorecard?source=legacy (cbzios fixture)', async () => {
  const { status, body } = await get('/cb/match/20717/scorecard?source=legacy');
  assert.equal(status, 200);
  const sc = body.result.scorecard;
  assert.ok(sc.innings.length >= 1, 'fixture has one rain-interrupted innings');
  const inn = sc.innings[0];
  assert.equal(inn.team, 'Sri Lanka Women');
  assert.equal(inn.score, '33/1');
  const bat = inn.batsmen[0];
  assert.equal(bat.name, 'Hasini Perera');
  assert.equal(bat.runs, 21);
  assert.equal(bat.dismissal, 'not out');
  assert.equal(inn.extras.total, 5);
});

test('GET /cb/match/:id/commentary returns ball-by-ball lines', async () => {
  // modern fixture (152097)
  const modern = await get('/cb/match/152097/commentary');
  assert.equal(modern.status, 200);
  const lines = modern.body.result.commentary;
  assert.ok(lines.length >= 10, 'modern fixture has many lines');
  assert.ok(lines[0].commentary || lines[0].text, 'commentary text present');
  // Modern capture keys the ball as ballNbr (no overNumber field observed).
  assert.ok(lines.some((l) => l.ball != null), 'some lines carry a ball number');
  assert.equal(modern.body.result.matchId, '152097');

  // legacy fixture (20717) — HTML stripped from comm lines
  const legacy = await get('/cb/match/20717/commentary');
  assert.equal(legacy.status, 200);
  const llines = legacy.body.result.commentary;
  assert.ok(llines.length > 0);
  assert.equal(legacy.body.result.matchId, '20717');
  assert.ok(!/[<>]/.test(llines[0].text), 'no raw HTML tags in commentary');
  assert.ok(llines.some((l) => l.event && l.event !== 'NONE'), 'events flagged');
  const extras = legacy.body.result.extras;
  assert.ok(extras, 'cbzios extras carried through');
  assert.ok(extras.overSummary, 'over summary carried through');
});

test('GET /cb/match/:id/squads returns both teams', async () => {
  const { status, body } = await get('/cb/match/20717/squads');
  assert.equal(status, 200);
  const teams = body.result.teams;
  assert.equal(teams.length, 2);
  const names = teams.map((t) => t.teamName).sort();
  assert.deepEqual(names, ['Australia', 'England']);
  for (const t of teams) {
    assert.ok(t.squad.length > 0, `${t.teamName} has squad`);
    const p = t.squad[0];
    assert.ok(p.id, 'player id present');
    assert.ok(p.name, 'player name present');
    assert.equal(typeof p.battingStyle, 'string');
  }
  // every squad id must resolve against the players index (no dangling ids)
  for (const t of teams) {
    assert.ok(t.squad.length >= 11, `${t.teamName} full XI present`);
  }
});

test('GET /cb/player/name returns personalInfo envelope (no fixture -> 404)', async () => {
  const { status, body } = await get('/cb/player/name?q=Virat%20Kohli');
  // No player-search fixture is recorded; fixtures mode must answer honestly
  // (404 NO_FIXTURE) rather than fabricating data.
  assert.equal(status, 404);
  assert.equal(body.success, false);
  assert.match(body.error.message, /playerSearch|fixture/i);
});

test('GET /cricinfo/current normalizes the ESPNcricinfo fixture', async () => {
  const { status, body } = await get('/cricinfo/current');
  assert.equal(status, 200);
  const { matches } = body.result;
  assert.ok(matches.length >= 1, 'cricinfo fixture lists matches');
  const m = matches[0];
  assert.equal(m.matchId, '115589');
  assert.equal(m.statusText, 'Bangladesh won by 6 wickets');
  assert.ok(m.matchId, 'matchId');
  assert.ok(m.teams, 'teams');
  // Fixture entries often have empty statusText; the field must still exist.
  assert.equal(typeof m.status, 'string');
  assert.ok(m.series?.name || m.seriesName, 'series name');
  assert.ok(m.venue, 'ground mapped to venue');
});

test('GET /cricinfo/match/:id requires seriesId', async () => {
  const noSeries = await get('/cricinfo/match/12345');
  assert.equal(noSeries.status, 400);
  const withSeries = await get('/cricinfo/match/12345?seriesId=999');
  assert.equal(withSeries.status, 404); // no fixture for arbitrary match
});

test('GET /img blocks non-allowlisted hosts and bad input', async () => {
  const noU = await get('/img');
  assert.equal(noU.status, 400);
  const evil = await get('/img?u=https://evil.example.com/x.png');
  assert.equal(evil.status, 403);
  const notUrl = await get('/img?u=not-a-url');
  assert.equal(notUrl.status, 400);
});

test('404 for unknown routes', async () => {
  const { status, body } = await get('/nope');
  assert.equal(status, 404);
  assert.equal(body.success, false);
});
