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
const {createServer}=await import('../src/server.js');
const server=createServer();
await new Promise(r=>server.listen(0,'127.0.0.1',r));
try {
  const candidate=await auditAssets({base:`http://127.0.0.1:${server.address().port}`,extraStandings:['/espn/standings/20921']});
  printReport('candidate-after',candidate);
  if(!candidate.passed) process.exitCode=1;
} finally {
  server.closeIdleConnections?.();
  await new Promise(r=>server.close(r));
}
