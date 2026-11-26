import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEspnInningsDetails, normalizeEspnStandings } from '../src/espn.js';
import { parseSportskeedaStandings, getSportskeedaStandings } from '../src/sportskeeda.js';

// Small reconstructed contract samples from inspected ESPN summary fields.
// These are NOT full live recordings or freshness evidence.
const stats = (obj) => ({ categories: [{ stats: Object.entries(obj).map(([name,value]) => ({ name,value })) }] });
const summary = (linescores) => ({ header: { competitions: [{ competitors: [{ team: { id:'1603' }, linescores }] }] } });
test('ESPN extras, FOW and partnerships preserve supplied values and batter identity', () => {
  const [inn] = normalizeEspnInningsDetails(summary([{ period:1, isBatting:true,
    statistics: stats({ extras:'7', byes:'1', legbyes:'2', noballs:'1', wides:'3', penalties:'0' }),
    fow:[{ wicketNumber:1, wicketOver:4.4, runs:66, fowType:'out', runsScored:39, ballsFaced:14, athlete:{ id:'1212583', displayName:'Hardik Tamore' } }],
    partnerships:[{ wicketNumber:1, fowType:'out', overs:4.4, runs:66, runRate:14.14,
      start:{ overs:'0', runs:'0', wickets:'0' }, end:{ overs:'4.4', runs:66, wickets:1 },
      batsmen:[{ athlete:{ id:'1212583', displayName:'Hardik Tamore' }, balls:14, runs:39 }, { athlete:{ id:'1292495', displayName:'Angkrish Raghuvanshi' }, balls:15, runs:26 }] }],
  }, { period:2, isBatting:false, runs:0 }]));
  assert.equal(inn.inningsId,1); assert.equal(inn.teamId,'1603');
  assert.deepEqual(inn.extras,{ total:7, byes:1, legByes:2, noBalls:1, wides:3, penalties:0 });
  assert.equal(inn.fallOfWickets[0].batsman.name,'Hardik Tamore');
  assert.equal(inn.fallOfWickets[0].overs,'4.4');
  assert.equal(inn.partnerships[0].batsmen[1].runs,26);
  assert.equal(inn.partnerships[0].start.runs,0);
});
test('ESPN missing sections remain null, supplied empty lists remain empty, four innings stay separate', () => {
  const rows = normalizeEspnInningsDetails(summary([1,2,3,4].map((period) => ({ period, isBatting:true, ...(period === 4 ? { fow:[], partnerships:[], statistics:stats({ extras:'0', byes:'' }) } : {}) }))));
  assert.equal(rows.length,4); assert.equal(rows[0].extras,null);
  assert.equal(rows[0].fallOfWickets,null); assert.equal(rows[0].partnerships,null);
  assert.deepEqual(rows[3].fallOfWickets,[]); assert.equal(rows[3].extras.total,0); assert.equal(rows[3].extras.byes,null);
  assert.deepEqual(normalizeEspnInningsDetails({}),[]);
});
test('ESPN standings support root and nested groups, preserve display stats and logos', () => {
  const entry = { team:{ id:1, displayName:'A', logos:[{ href:'https://example.org/a.png' }] }, stats:[{ name:'for', value:6.85, displayValue:'137/20.0' },{name:'matchPoints',value:0,displayValue:'0'}] };
  const r = normalizeEspnStandings({ standings:{ entries:[entry] }, children:[{ name:'Group A', children:[{ standings:{ season:2026, entries:[entry] } }] }] },'8661');
  assert.equal(r.groups.length,2); assert.equal(r.groups[1].season,2026);
  assert.equal(r.groups[0].entries[0].displayStats.for,'137/20.0');
  assert.equal(r.groups[0].entries[0].stats.matchPoints,0);
  assert.equal(r.groups[0].entries[0].team.imageUrl,'https://example.org/a.png');
});
test('Sportskeeda semantic table parser: group, logo, numeric zero and no invented season', () => {
  // Synthetic HTML representing the semantic table observed in public pages.
  const html = `<h1>SMAT Points Table</h1><h2>Group A</h2><table><tr><th>Pos</th><th>Teams</th><th>P</th><th>W</th><th>L</th><th>NR</th><th>PTS</th><th>NRR</th></tr><tr><td>1</td><td><a href="/team/baroda-cricket"><img src="https://staticg.sportskeeda.com/skm/assets/team-logos/cricket/baroda-cricket.png">Baroda</a></td><td>7</td><td>5</td><td>2</td><td>0</td><td>20</td><td>1.561</td></tr></table>`;
  const r = parseSportskeedaStandings(html,'syed-mushtaq-ali-trophy');
  assert.equal(r.groups[0].name,'Group A');
  assert.equal(r.groups[0].entries[0].team.id,'baroda-cricket');
  assert.equal(r.groups[0].entries[0].stats.noresult,0);
  assert.equal(r.groups[0].entries[0].stats.netrr,1.561);
  assert.equal(r.seasonVerified,false); assert.equal(r.season,null);
  assert.throws(() => parseSportskeedaStandings('<html>challenge</html>','ipl'),/markup/);
  assert.throws(() => getSportskeedaStandings('../bad'),/invalid/);
  assert.throws(() => getSportskeedaStandings('ipl'),/live fetch disabled/);
});
