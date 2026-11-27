import { flagCandidates } from '../src/national-flags.js';
import { inspectAsset } from './validate-team-assets.mjs';
import { writeFile } from 'node:fs/promises';
// Build-time only: no public audit endpoint and no credentials in evidence.
// Failure prevents the new Vercel deployment from replacing a healthy release.
import { spawnSync } from 'node:child_process';
import { auditAssets } from './validate-team-assets.mjs';

const tests = spawnSync('npm', ['test'], { stdio:'inherit', env:{...process.env,DATA_MODE:'fixtures'} });
if (tests.status !== 0) process.exit(tests.status || 1);

function printReport(label,report) {
  console.log('ASSET_AUDIT_SUMMARY '+JSON.stringify({label,checkedAt:report.checkedAt,base:report.base,counts:report.counts,passed:report.passed}));
  for(const route of report.routes) console.log('ASSET_AUDIT_ROUTE '+JSON.stringify({label,...route}));
  for(const result of report.results) console.log('ASSET_AUDIT_URL '+JSON.stringify({label,...result}));
}
const baseline=await auditAssets({base:'https://cricketapi-beryl.vercel.app',extraStandings:['/espn/standings/20921']});
printReport('production-before',baseline);
// A broken production inventory is diagnostic, never a bypass for candidate failure.
process.env.DATA_MODE='live';
process.env.ASSET_DISCOVERY='1';
const {createServer}=await import('../src/server.js');
const server=createServer();
await new Promise(r=>server.listen(0,'127.0.0.1',r));
try {
  const base=`http://127.0.0.1:${server.address().port}`;
  // Inventory the candidate too: production may have nulled these URLs already.
  // Reconfirm exact source references on every build; never resurrect exclusions
  // simply because a previous production payload no longer advertises them.
  const extraPaths=['/espn/match/1562355?league=1562333&date=20261127','/espn/match/1562355/squads?league=1562333&date=20261127','/espn/series/1562333/matches?date=20261127'];
  const preflight=await auditAssets({base,extraPaths,extraStandings:['/espn/standings/20921']});
  printReport('candidate-before-remediation',preflight);
  const unique=new Map([...baseline.results,...preflight.results].map(r=>[r.url,r]));
  const validations = Object.fromEntries([...unique.values()].map(r=>[r.url,r]));
  for (const url of flagCandidates) if (!validations[url]) validations[url]={url,...await inspectAsset(url)};
  await writeFile(new URL('../src/validated-assets.json',import.meta.url),JSON.stringify(validations,null,2)+'\n');
  const {applyValidatedAssets}=await import('../src/team-assets.js');
  applyValidatedAssets(validations);
  delete process.env.ASSET_DISCOVERY;
  for (const item of Object.values(validations)) console.log('ASSET_VALIDATION '+JSON.stringify(item));
  const candidate=await auditAssets({base,extraPaths,extraStandings:['/espn/standings/20921']});
  printReport('candidate-after',candidate);
  await writeFile('asset-verification.json',JSON.stringify({baseline,preflight,validations,candidate},null,2)+'\n');
  const samples=[];
  for (const path of ['/cb/live','/espn/match/1562355?league=1562333&date=20261127']) {
    const r=await fetch(base+path); const body=await r.json();
    const sample={path,status:r.status,cacheControl:r.headers.get('cache-control'),body};
    samples.push(sample);
    console.log('SAMPLE_PAYLOAD '+JSON.stringify(sample));
  }
  await writeFile('asset-samples.json',JSON.stringify(samples,null,2)+'\n');
  const nullTeams=new Map();
  function collect(v,route) {
    if (!v || typeof v!=='object') return;
    const id=v.id ?? v.teamId, name=v.name ?? v.teamName;
    if (name && (Object.hasOwn(v,'flagUrl') || Object.hasOwn(v,'imageUrl'))) {
      const reasons={};
      if (v.flagUrl===null) reasons.flagUrl='No explicit national ISO identity, or CDN asset did not pass validation (see validations)';
      if (v.imageUrl===null) reasons.imageUrl='Provider asset absent, known exact dead URL, or failed HTTPS/HTTP200/image MIME/204800-byte validation';
      if (Object.keys(reasons).length) nullTeams.set(`${id}:${name}:${route}`,{id,name,route,reasons});
    }
    Object.values(v).forEach(x=>collect(x,route));
  }
  for (const route of candidate.routes.filter(r=>r.ok)) collect(await (await fetch(base+route.path)).json(),route.path);
  const nullReport=[...nullTeams.values()];
  await writeFile('asset-null-teams.json',JSON.stringify(nullReport,null,2)+'\n');
  for(const team of nullReport) console.log('NULL_TEAM '+JSON.stringify(team));
  console.log(`NON_NULL_ASSETS_FAILING=${candidate.results.filter(r=>r.verdict!=='green').length}`);
  if(!candidate.passed || !['bd','pk'].every(iso=>validations[`https://flagcdn.com/w40/${iso}.png`]?.verdict==='green')) process.exitCode=1;
} finally {
  server.closeIdleConnections?.();
  await new Promise(r=>server.close(r));
}
