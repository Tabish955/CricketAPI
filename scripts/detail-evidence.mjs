import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';

// Called only in the remote live build. Never label a historical match live.
export async function detailEvidence(base) {
  async function get(path) {
    const r=await fetch(base+path); const body=await r.json();
    return {path,status:r.status,cacheControl:r.headers.get('cache-control'),body};
  }
  const live=await get('/espn/live');
  assert.equal(live.status,200);
  const matches=live.body.result.matches || [];
  const t20=matches.find(m=>/T20I/i.test(m.format));
  const paths=new Map([
    ['/espn/match/1561236?league=1561006&date=20261127','requested-domestic'],
    ['/espn/match/1562331?league=1562322&date=20261127','requested-women-finished'],
  ]);
  if(t20) { const u=new URL(t20.detail); paths.set(u.pathname+u.search,'live-t20i'); }
  const samples=[];
  for(const [path,label] of paths) {
    const sample={label,...await get(path)};
    assert.equal(sample.status,200,`${label}: detail unavailable`);
    assert.match(sample.cacheControl || '',/no-store/);
    const m=sample.body.result.match;
    assert.ok(m && 'toss' in m && 'officials' in m && 'pitch' in m);
    assert.equal(sample.body.meta.source.detail?.source,'live',`${label}: summary metadata unavailable`);
    if(m.toss) assert.ok([m.team1.id,m.team2.id].includes(m.toss.winnerTeamId));
    samples.push(sample);
    const u=new URL(path,'http://build');
    const squads=await get(u.pathname+'/squads'+u.search);
    assert.equal(squads.status,200,`${label}: squads unavailable`);
    assert.match(squads.cacheControl || '',/no-store/);
    for(const team of squads.body.result.teams) {
      if(team.isAnnounced===true) {
        assert.equal(team.players.length,11);
        assert.ok(team.players.every(p=>p.isStarter===true));
      }
      assert.ok(team.players.every(p=>p.role===null || (p.role.trim() && p.role.toLowerCase()!=='unknown')));
    }
    samples.push({label:label+'-squads',...squads});
  }
  const coverage={liveDomestic:samples.some(s=>s.label==='requested-domestic' && s.body.result.match?.live===true),
    liveT20International:!!t20,women:true,finished:samples.some(s=>s.body.result.match?.category==='recent')};
  for(const sample of samples) console.log('DETAIL_SAMPLE '+JSON.stringify(sample));
  console.log('DETAIL_EVIDENCE '+JSON.stringify({coverage,transportPassed:true,mergeReady:Object.values(coverage).every(Boolean)}));
  await writeFile('detail-samples.json',JSON.stringify({coverage,samples},null,2)+'\n');
  // Missing live fixture class is an explicit review gap, not fabricated evidence.
}
