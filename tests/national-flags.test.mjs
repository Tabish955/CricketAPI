import {test} from 'node:test';
import assert from 'node:assert/strict';
import {nationalFlag} from '../src/national-flags.js';
import {teamAssets,applyValidatedAssets,sanitizeTeamPayload} from '../src/team-assets.js';
import {inspectAsset} from '../scripts/validate-team-assets.mjs';
test('explicit national identities, never club substring inference',()=>{
  assert.equal(nationalFlag({name:'Bangladesh A'}),'https://flagcdn.com/w40/bd.png');
  assert.equal(nationalFlag({name:'Pakistan A'}),'https://flagcdn.com/w40/pk.png');
  for(const name of ['West Indies','Scotland','India Capitals','Pakistan-administered Kashmir Region','Surrey']) assert.equal(nationalFlag({name,short:'IND'}),null);
});
test('unverified assets null; verification changes only asset values',()=>{
  delete process.env.ASSET_DISCOVERY;
  const bd='https://flagcdn.com/w40/bd.png';
  applyValidatedAssets({[bd]:{verdict:'green'}});
  const t=teamAssets({id:'668',name:'Bangladesh A',imageUrl:'https://example.org/dead'});
  assert.equal(t.flagUrl,bd);assert.equal(t.imageUrl,null);
  const scores=[{team:'BAN-A',teamId:'668',score:'169/5'}];
  assert.deepEqual(sanitizeTeamPayload({team1:t,scores}).scores,scores);
  assert.equal(teamAssets({name:'Pakistan A'}).flagUrl,null);
});
test('strict transport status, scheme, MIME and actual size checks',async()=>{
  for(const [url,status,mime,body] of [
    ['http://example.org/a',200,'image/png','x'],
    ['https://example.org/a',201,'image/png','x'],
    ['https://example.org/a',200,'text/html','x'],
    ['https://example.org/a',200,'image/png','x'.repeat(204801)],
  ]) assert.notEqual((await inspectAsset(url,async()=>new Response(body,{status,headers:{'content-type':mime}}))).verdict,'green');
});
