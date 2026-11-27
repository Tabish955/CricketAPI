// Network diagnostic and fail-closed CI gate. HEAD bytes are advertised length,
// NOT measured GET bytes. No path/size variants are guessed.
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export async function inspectAsset(url, transport = fetch) {
  try {
    if (!url.startsWith('https://')) return {verdict:'red',status:null,reason:'https required'};
    const r = await transport(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(12000) });
    const contentType = r.headers.get('content-type');
    const length = r.headers.get('content-length');
    let bytes = 0;
    if (r.body) {
      const reader = r.body.getReader();
      try { for (;;) { const part=await reader.read(); if(part.done) break; bytes+=part.value.byteLength; if(bytes>204800){await reader.cancel();break;} } }
      finally {reader.releaseLock();}
    }
    const verdict = r.status === 200 && /^image\//i.test(contentType || '') && bytes>0 && bytes<=204800 && (!r.url || r.url.startsWith('https://')) ? 'green' : 'red';
    return { verdict, status: r.status, contentType, advertisedBytes: length && /^\d+$/.test(length) ? Number(length) : null,
      actualBytes: bytes, finalUrl: r.url || url, cacheControl: r.headers.get('cache-control'),
      etag: r.headers.get('etag'), accessControlAllowOrigin: r.headers.get('access-control-allow-origin'),
      crossOriginResourcePolicy: r.headers.get('cross-origin-resource-policy') };
  } catch (err) { return { verdict: 'unknown', status: null, contentType: null, advertisedBytes: null, actualBytes: null, error: err.message }; }
}

export function extractAssets(value, route, assets = new Map(), leagues = new Map()) {
  if (!value || typeof value !== 'object') return { assets, leagues };
  for (const field of ['imageUrl','flagUrl']) if (typeof value[field] === 'string' && value[field]) {
    const item = assets.get(value[field]) || { url: value[field], ids: [], names: [], routes: [] };
    for (const [key,v] of [['ids',value.id],['names',value.name],['routes',route]]) if (v != null && !item[key].includes(String(v))) item[key].push(String(v));
    assets.set(value[field],item);
  }
  if (typeof value.detail === 'string') {
    try {
      const u = new URL(value.detail, 'https://cricketapi-beryl.vercel.app');
      const league = u.searchParams.get('league');
      if (/^\/espn\/match\/\d+$/.test(u.pathname) && /^\d+$/.test(league || '')) leagues.set(`espn:${league}`, `/espn/standings/${league}`);
      if (/^\/cb\/match\/\d+$/.test(u.pathname) && /^\d+$/.test(String(value.seriesId || ''))) leagues.set(`cb:${value.seriesId}`, `/cb/series/${value.seriesId}/points-table`);
    } catch { /* malformed link: not a source of trusted provider identity */ }
  }
  for (const v of Object.values(value)) if (v && typeof v === 'object') extractAssets(v, route, assets, leagues);
  return { assets, leagues };
}

export async function auditAssets({ base, transport = fetch, extraStandings = [], extraPaths = [] }) {
  const assets = new Map(), leagues = new Map(), routes = [];
  let nullReferences = 0;
  const teamReferences = [];
  const countNulls = (v) => {
    if (!v || typeof v !== 'object') return;
    if (Object.hasOwn(v,'imageUrl') && v.imageUrl === null) nullReferences++;
    Object.values(v).forEach(countNulls);
  };
  async function discover(path) {
    try {
      const r = await transport(new URL(path,base), { signal: AbortSignal.timeout(45000) });
      const body = await r.json();
      if (!r.ok || body.success !== true) throw new Error(`HTTP ${r.status}; success=${body.success}`);
      routes.push({ path, status:r.status, ok:true });
      function record(v) {
        if(!v || typeof v!=='object') return;
        if ((v.name || v.teamName) && (Object.hasOwn(v,'flagUrl') || Object.hasOwn(v,'imageUrl'))) teamReferences.push({id:v.id ?? v.teamId,name:v.name ?? v.teamName,route:path,imageUrl:v.imageUrl,flagUrl:v.flagUrl});
        Object.values(v).forEach(record);
      }
      record(body);
      extractAssets(body,path,assets,leagues); countNulls(body);
    } catch (err) { routes.push({ path, ok:false, error:err.message }); }
  }
  // Serial discovery and small asset batches avoid cold-start/provider bursts.
  for (const provider of ['cb','espn','crex']) for (const kind of ['live','recent','upcoming']) await discover(`/${provider}/${kind}`);
  for (const path of ['/cricinfo/current','/cricinfo/live']) await discover(path);
  for (const path of extraPaths) await discover(path);
  for (const path of extraStandings) {
    if (!/^\/(espn\/standings\/\d+|cb\/series\/\d+\/points-table|sportskeeda\/series\/[a-z0-9-]{1,100}\/points-table)$/.test(path)) throw new Error('Invalid explicit standings path');
    leagues.set(path,path);
  }
  for (const path of new Set(leagues.values())) await discover(path);
  const items = [...assets.values()];
  const results = [];
  for (let i=0; i<items.length; i+=4) results.push(...await Promise.all(items.slice(i,i+4).map(async (item) => ({ ...item, ...await inspectAsset(item.url,transport) }))));
  const counts = { uniqueUrls:results.length, green:results.filter((r)=>r.verdict==='green').length,
    red:results.filter((r)=>r.verdict==='red').length, unknown:results.filter((r)=>r.verdict==='unknown').length,
    discoveryFailures:routes.filter((r)=>!r.ok).length, nullReferences };
  return { checkedAt:new Date().toISOString(), base, scope:'Current list window and standings for discovered provider-scoped leagues plus explicit standings paths; not all historical IDs or undiscovered leagues.',
    method:'GET; measured bytes <=204800; HTTPS; HTTP200; image MIME', counts,
    passed: routes.length > 0 && counts.discoveryFailures===0 && counts.unknown===0 && counts.red===0 && counts.green>0,
    routes, results, teamReferences };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const base = process.env.API_BASE || 'https://cricketapi-beryl.vercel.app';
  const extraStandings = process.argv.filter((v)=>v.startsWith('--standings=')).map((v)=>v.slice(12));
  const report = await auditAssets({ base, extraStandings });
  const out = process.argv.find((v)=>v.startsWith('--out='))?.slice(6) || 'asset-audit.json';
  await writeFile(out,JSON.stringify(report,null,2)+'\n');
  for (const r of report.results) console.log(`${r.verdict.toUpperCase()} ${r.ids.join(',') || '(no id)'} ${r.status ?? 'NETWORK'} ${r.contentType ?? '-'} ${r.advertisedBytes ?? '?'} B ${r.url}`);
  console.log(JSON.stringify(report.counts));
  process.exitCode = report.passed ? 0 : 1;
}
