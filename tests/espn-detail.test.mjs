import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeEspnDetail,confirmedXI,playerRole} from '../src/espn-detail.js';
import {normalizeEspnSquads} from '../src/espn.js';
const teams=[{id:'299042',name:'Malaysia Women'},{id:'1116740',name:'Indonesia Women'}];
test('observed summary toss note resolves exact full identity, not order or abbreviation',()=>{
  const raw={notes:[{type:'toss',text:'Indonesia Women , elected to field first'}]};
  assert.deepEqual(normalizeEspnDetail(raw,teams).toss,{winnerTeamId:'1116740',choice:'field'});
  assert.deepEqual(normalizeEspnDetail(raw,[...teams].reverse()).toss,{winnerTeamId:'1116740',choice:'field'});
  for(const text of ['IDN-W , elected to field first','Indonesia Women won toss','Indonesia Women , elected to bowl first'])
    assert.equal(normalizeEspnDetail({notes:[{type:'toss',text}]},teams).toss,null);
  assert.equal(normalizeEspnDetail({...raw,notes:[...raw.notes,...raw.notes]},teams).toss,null);
  assert.equal(normalizeEspnDetail(raw,[...teams,teams[1]]).toss,null);
});
test('absent metadata stays null; officials use published structured role only',()=>{
  assert.deepEqual(normalizeEspnDetail({},teams),{toss:null,officials:null,pitch:null});
  const raw={gameInfo:{venue:{address:{summary:'Street address, not pitch'}},officials:[
    {displayName:'Nur Hijrah',position:{name:'umpire'}},
    {displayName:'Rudy Ismandy',position:{name:'umpire'}},
    {displayName:'Edwin Seah',position:{name:'referee'}},
    {displayName:'Do not guess',position:{name:'other'}}]}};
  assert.deepEqual(normalizeEspnDetail(raw,teams),{toss:null,pitch:null,officials:{umpires:['Nur Hijrah','Rudy Ismandy'],tvUmpire:null,referee:'Edwin Seah'}});
});
test('confirmed XI requires eleven distinct identified rows with literal starter=true',()=>{
  const rows=Array.from({length:11},(_,i)=>({starter:true,athlete:{id:String(i+1)}}));
  assert.equal(confirmedXI(rows),true);
  assert.equal(confirmedXI(rows.slice(1)),null);
  assert.equal(confirmedXI([...rows,rows[0]]),null);
  assert.equal(confirmedXI(rows.map(()=>rows[0])),null);
  assert.equal(confirmedXI(rows.map(r=>({...r,starter:'true'}))),null);
  assert.equal(confirmedXI(rows.map(r=>({...r,starter:undefined}))),null);
});
test('unknown/empty roles null; styles never promoted to roles; no new player images',()=>{
  for(const v of ['Unknown',' unknown ','',undefined,null,'   ']) assert.equal(playerRole(v),null);
  const [side]=normalizeEspnSquads([{team:{id:'1'},roster:[{athlete:{id:'2',displayName:'Player',position:{name:'Unknown'},style:[{type:'batting',description:'Right-hand bat'}]}}]}]);
  assert.equal(side.isAnnounced,null);assert.equal(side.players[0].role,null);
  assert.equal(side.players[0].battingStyle,'Right-hand bat');
  assert.equal('headshotUrl' in side.players[0],false);
});
