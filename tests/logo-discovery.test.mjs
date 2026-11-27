import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseTeamLogo,discoverTeamLogos} from '../scripts/discover-team-logos.mjs';
import {teamAssets,applyValidatedAssets} from '../src/team-assets.js';
const team={id:'1346027',name:'Abu Dhabi Knight Riders'};
const url='https://img1.hscicdn.com/image/upload/f_auto/lsci/db/PICTURES/CMS/349600/349617.png';
function page({id='1346027',name=team.name,image=url}={}) {return `<link rel="canonical" href="https://www.espncricinfo.com/team/abu-dhabi-knight-riders-${id}"><meta property="og:title" content="${name} Cricket Team"><meta property="og:image" content="${image}"><img alt="${name} Logo" src="${image}">`;}
test('primary page logo requires exact numeric team and full name identity',()=>{
  assert.equal(parseTeamLogo(page(),team,'https://www.espncricinfo.com').url,url);
  for(const html of [page({id:'1'}),page({name:'Kolkata Knight Riders'}),page({image:'https://example.org/unknown.png'}),page({image:'http://img1.hscicdn.com/lsci/db/PICTURES/a.png'}),'<title>Cricket</title>']) assert.equal(parseTeamLogo(html,team,'https://www.espncricinfo.com'),null);
});
test('discovery does not turn unavailable primary pages into candidate images',async()=>{
  const r=await discoverTeamLogos([team,team],async()=>new Response('',{status:403}));
  assert.equal(r.length,1); assert.equal(r[0].status,403);assert.equal(r[0].url,undefined);
});
test('exact team registry may recover only transport-validated marks; never same-name/ID substitutes',()=>{
  delete process.env.ASSET_DISCOVERY;
  applyValidatedAssets({[url]:{verdict:'green'}});
  const result=teamAssets({...team,imageUrl:'https://a.espncdn.com/i/teamlogos/cricket/500/1346027.png'});
  assert.equal(result.imageUrl,url);assert.equal(result.flagUrl,null);
  assert.equal(teamAssets({...team,id:'1'}).imageUrl,null);
  assert.equal(teamAssets({...team,name:'Kolkata Knight Riders'}).imageUrl,null);
  applyValidatedAssets({});assert.equal(teamAssets(team).imageUrl,null);
});
