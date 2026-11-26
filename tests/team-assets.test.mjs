import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectAsset, auditAssets, extractAssets } from '../scripts/validate-team-assets.mjs';
import { teamAssets, sanitizeTeamPayload, rejectedCrests } from '../src/team-assets.js';
import { normalizeEspnEvent } from '../src/espn.js';

test('reported exact dead URLs become null, no ID/path guessing or player portrait rewriting', () => {
  for (const url of rejectedCrests.keys()) assert.equal(teamAssets({ imageUrl:url }).imageUrl,null);
  const good = 'https://a.espncdn.com/i/teamlogos/cricket/500/1781.png';
  const result = sanitizeTeamPayload({ result:{ team1:{id:'1',short:'A',imageUrl:good},team2:{id:'2',short:'B',imageUrl:''},scores:[{team:'A'},{team:'Unknown'}],players:[{id:'3',imageUrl:[...rejectedCrests.keys()][0]}] } });
  assert.equal(result.result.team1.imageUrl,good);
  assert.equal(result.result.team1.flagUrl,null);
  assert.equal(result.result.team2.imageUrl,null);
  assert.equal(result.result.scores[0].teamId,'1');
  assert.equal(result.result.scores[1].teamId,null);
  assert.equal(result.result.players[0].imageUrl,[...rejectedCrests.keys()][0]);
});
test('ambiguous score names never get guessed IDs; innings provider IDs are retained', () => {
  const r = sanitizeTeamPayload({team1:{id:'1',short:'A'},team2:{id:'2',short:'A'},scores:[{team:'A'},{team:'A',teamId:'x'}]});
  assert.equal(r.scores[0].teamId,null); assert.equal(r.scores[1].teamId,'x');
  const m = normalizeEspnEvent({id:'m',competitions:[{competitors:[{team:{id:'2',abbreviation:'A'},linescores:[{period:1,isBatting:true,runs:0,wickets:0,overs:0,description:'declared'}]}]}]});
  assert.equal(m.scores[0].teamId,'2'); assert.equal(m.scores[0].declared,true);
});
test('HEAD validation distinguishes red from unknown and records advertised bytes/headers', async () => {
  const ok = await inspectAsset('https://example.org/ok',async (_,opts) => {
    assert.equal(opts.method,'HEAD');
    return new Response(null,{status:200,headers:{'content-type':'image/png','content-length':'10376','cache-control':'public,max-age=60'}});
  });
  assert.equal(ok.verdict,'green'); assert.equal(ok.advertisedBytes,10376); assert.equal(ok.actualBytes,null);
  for (const [status,type,expected] of [[404,'text/html','red'],[200,'text/html','red'],[429,'text/html','unknown'],[405,'text/html','unknown']]) {
    const r=await inspectAsset('https://example.org/a',async()=>new Response(null,{status,headers:{'content-type':type}}));
    assert.equal(r.verdict,expected);
  }
  assert.equal((await inspectAsset('https://example.org/a',async()=>{throw Error('blocked')})).verdict,'unknown');
});
test('discovery deduplicates URLs, uses returned ESPN league not team IDs', () => {
  const r=extractAssets({matches:[{detail:'https://api.example/espn/match/1?league=8661',seriesId:'wrong',team1:{id:'a',imageUrl:'https://example.org/a'}},{team1:{id:'a',imageUrl:'https://example.org/a'}}]},'/espn/live');
  assert.equal(r.assets.size,1); assert.equal(r.leagues.get('espn:8661'),'/espn/standings/8661');
});
test('audit gate rejects incomplete discovery and cannot pass on an empty inventory',async()=>{
  const missing=await auditAssets({base:'https://example.org',transport:async()=>{throw Error('network')}});
  assert.equal(missing.passed,false); assert.equal(missing.counts.discoveryFailures,11);
  const empty=await auditAssets({base:'https://example.org',transport:async()=>new Response(JSON.stringify({success:true,result:{matches:[]}}))});
  assert.equal(empty.passed,false);
});
test('candidate audit traverses discovered standings and exposes green/red/unknown counts',async()=>{
  const r=await auditAssets({base:'https://example.org',transport:async(url,opts)=>{
    if(opts?.method==='HEAD') return new Response(null,{headers:{'content-type':'image/png'}});
    if(String(url).includes('/standings/')) return new Response(JSON.stringify({success:true,result:{groups:[{entries:[{team:{id:'2',imageUrl:'https://cdn.example/2'}}]}]}}));
    return new Response(JSON.stringify({success:true,result:{matches:[{detail:'https://example.org/espn/match/1?league=8661',team1:{id:'1',imageUrl:'https://cdn.example/1'}}]}}));
  }});
  assert.equal(r.passed,true); assert.equal(r.counts.green,2); assert.equal(r.routes.length,12);
});

test('HTTP boundary returns remediated assets and JSON errors with explicit no-store',async()=>{
  const { createServer }=await import('../src/server.js');
  const server=createServer();
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${server.address().port}`;
  try {
    const r=await fetch(`${base}/espn/standings/20921`);
    assert.equal(r.status,200); assert.match(r.headers.get('content-type'),/application\/json/);
    assert.equal(r.headers.get('cache-control'),'no-store');
    const body=await r.json();
    for (const group of body.result.groups) for(const entry of group.entries) {
      assert.equal(entry.team.flagUrl,null);
      assert.ok(!rejectedCrests.has(entry.team.imageUrl));
    }
    for(const [path,status] of [['/not-a-route',404],['/espn/match/1',400]]) {
      const error=await fetch(base+path);
      assert.equal(error.status,status); assert.match(error.headers.get('content-type'),/application\/json/);
      const json=await error.json(); assert.equal(json.success,false); assert.equal(typeof json.error.message,'string');
    }
  } finally { await new Promise(r=>server.close(r)); }
});
