// Build-only confirmation of exact URLs from a measured inventory. Never guess
// alternatives; a failed GET/network/access-control response cannot prove absence.
export async function confirmDeadAssets(report, transport = fetch) {
  const confirmed=[];
  for (const item of report.results.filter((r)=>[404,410].includes(r.status))) {
    try {
      const r=await transport(item.url,{signal:AbortSignal.timeout(12000),redirect:'follow'});
      // Only consume tiny negative bodies; an unexpected live image is cancelled.
      if(![404,410].includes(r.status)) { await r.body?.cancel(); continue; }
      let bytes=0;
      if(r.body) {
        const reader=r.body.getReader();
        try { for(;;) {const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>65536){await reader.cancel();break;}} }
        finally { reader.releaseLock(); }
      }
      confirmed.push({url:item.url,ids:item.ids,names:item.names,status:r.status,headStatus:item.status,
        contentType:r.headers.get('content-type'),negativeBodyBytes:bytes,
        checkedAt:new Date().toISOString(),evidence:'Vercel build HEAD inventory + GET confirms missing exact URL; alternatives not established'});
    } catch { /* Unknown is not evidence of absence. Candidate gate still fails. */ }
  }
  return confirmed;
}
