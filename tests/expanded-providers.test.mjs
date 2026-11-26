import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCrexSchedule } from '../src/crex.js';
import { normalizeEspnPlayerInnings } from '../src/espn.js';

test('CREX SSR contract: categories, stable IDs, scores and safe upstream links', () => {
  // Synthetic selector-contract input, not a recorded live payload.
  const card = (id, status, extra='') => `<app-match-card><a class="match-card-wrapper" href="/cricket-live-score/a-vs-b-match-updates-${id}">
    <div class="team-info"><span class="team-name">A</span><span class="team-score">0/0</span><span class="total-overs">0.0</span></div>
    <div class="team-info"><span class="team-name">B</span><span class="team-score">Yet to bat</span></div>
    ${status}${extra}</a></app-match-card>`;
  const rows = parseCrexSchedule(card('ABC','<div class="result live">Live</div>') +
    card('DEF','<div class="result"><div class="notes">A won by 5 runs</div></div>') +
    card('GHI','<div class="start-text">13:30</div>') + card('UNK',''));
  assert.deepEqual(rows.map((m) => m.category), ['live','recent','upcoming']);
  assert.equal(rows[0].matchId,'ABC'); assert.equal(rows[0].scores[0].score,'0/0');
  assert.equal(rows[0].scores.length,1); assert.equal(rows[0].startDate,null);
  assert.match(rows[0].upstream,/^https:\/\/crex.com\//);
  assert.throws(() => parseCrexSchedule('<html>Challenge</html>'),/markup/);
  assert.throws(() => parseCrexSchedule(card('ABC','<div class="result live"></div>').replace('/cricket-live-score/', 'https://evil.example/cricket-live-score/')),/markup/);
});

test('ESPN player innings: distinguish batting, bowling and fielding, no nested double counts', () => {
  const stats = (values, batting) => ({ categories: [{ stats: Object.entries(values).map(([name,value]) => ({ name,value })) }], ...(batting ? { batting } : {}) });
  const rosters = [{ team: { id: 'a', abbreviation: 'A' }, roster: [{ athlete: { id:'1', displayName:'Batter' }, linescores: [
    { period: 1, statistics: stats({ inningsNumber:1, batted:1, runs:0, ballsFaced:1, battingPosition:1, outs:1 }, { outDetails: { shortText:'b Bowler' } }), linescores:[{ statistics: stats({ runs:999 }) }] },
    { period: 2, statistics: stats({ inningsNumber:2, inningsFielded:1, inningsBowled:0 }) },
  ] }] }, { team: { id:'b' }, roster:[{ athlete: { id:'2', displayName:'Bowler' }, linescores:[
    { period:1, statistics:stats({ inningsNumber:1, inningsBowled:1, overs:3.2, conceded:20, wickets:2, economyRate:6 }) },
  ] }] }];
  const innings = normalizeEspnPlayerInnings(rosters);
  assert.equal(innings.length,1); assert.equal(innings[0].batsmen.length,1);
  assert.equal(innings[0].batsmen[0].runs,0); assert.equal(innings[0].batsmen[0].dismissal,'b Bowler');
  assert.equal(innings[0].bowlers[0].wickets,2); assert.equal(innings[0].bowlers[0].overs,'3.2');
  assert.equal(innings[0].team,'A');
});

test('ESPN commentary normalizes short ball text, score and wicket without inventing data', async () => {
  const { normalizeEspnCommentary } = await import('../src/espn.js');
  const r = normalizeEspnCommentary({ commentary: { count: 1, pageIndex: 1, pageCount: 1, pageSize: 25, items: [{ id: '110', shortText: 'Bowler to Batter, OUT', playType: { description: 'wicket' }, innings: { number: 2, runs: 100, totalRuns: 0, wickets: 3 }, over: { actual: 12.1, ball: 1 }, dismissal: { dismissal: true } }] } });
  assert.equal(r.commentary[0].text,'Bowler to Batter, OUT');
  assert.equal(r.commentary[0].score,'100/3'); assert.equal(r.commentary[0].wicket,true);
  assert.equal(r.commentary[0].runs,null); assert.equal(r.page,1);
  assert.throws(() => normalizeEspnCommentary({}),/missing/);
});
