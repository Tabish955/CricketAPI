import {countries, nationalFlag, flagNullReason} from '../src/national-flags.js';
import {writeFile} from 'node:fs/promises';

export async function reportFlagCoverage({candidate,validations,base}) {
  const codes=Object.entries(countries).map(([code,names])=>{
    const url=`https://flagcdn.com/w40/${code}.png`, r=validations[url];
    return {code,names,url,status:r?.status??null,mime:r?.contentType??null,bytes:r?.actualBytes??null,verdict:r?.verdict??'unknown'};
  });
  for(const code of codes) console.log('FLAG_CODE '+JSON.stringify(code));
  const teams=[...new Map(candidate.teamReferences.filter(t=>/^\/cb\/(live|recent|upcoming)$/.test(t.route)).map(t=>[`${t.id}:${t.name}:${t.route}`,t])).values()];
  const supplied=teams.filter(t=>t.flagUrl).map(({id,name,route,flagUrl})=>({id,name,route,flagUrl}));
  const absent=teams.filter(t=>!t.flagUrl).map(({id,name,route})=>({id,name,route,reason:flagNullReason({name})}));
  for(const team of supplied) console.log('FLAG_SUPPLIED '+JSON.stringify(team));
  for(const team of absent) console.log('FLAG_NULL '+JSON.stringify(team));
  // Small, focused sample logs avoid Vercel's single-line truncation of /cb/live.
  const response=await fetch(base+'/cb/live'); const body=await response.json();
  const matches=body.result?.matches || [];
  const indonesia=matches.filter(m=>[m.team1,m.team2].some(t=>String(t?.id)==='1116740'));
  for(const m of indonesia) console.log('IDN_LIVE_SAMPLE '+JSON.stringify({matchId:m.matchId,team1:m.team1,team2:m.team2,scores:m.scores}));
  console.log('IDN_LIVE_OBSERVED '+indonesia.length);
  const report={codes,supplied,absent,indonesiaLiveSamples:indonesia};
  await writeFile('flag-coverage.json',JSON.stringify(report,null,2)+'\n');
  // A present mapped national side cannot silently lose its flag.
  const missing=teams.filter(t=>nationalFlag({name:t.name}) && !t.flagUrl);
  if(missing.length) throw new Error('Mapped national flags absent: '+missing.map(t=>`${t.id}:${t.name}`).join(','));
  return report;
}
