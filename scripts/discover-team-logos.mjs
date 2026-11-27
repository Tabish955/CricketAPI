// Primary-source page discovery. Not image path guessing, CDN bypass or scraping
// private endpoints. Failure is explicit; no unchecked URL becomes a fallback.
import * as cheerio from 'cheerio';
export function parseTeamLogo(html,team,pageUrl) {
  const $=cheerio.load(html);
  const canonical=$('link[rel="canonical"]').attr('href');
  const title=$('meta[property="og:title"]').attr('content') || $('title').text();
  const image=$('meta[property="og:image"]').attr('content');
  try {
    const page=new URL(canonical || pageUrl), url=new URL(image);
    const normalize=s=>String(s).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
    if(!['www.espncricinfo.com','www.cricinfo.com'].includes(page.hostname) || !page.pathname.endsWith('-'+team.id)) return null;
    // Require canonical identity + full team name, not a generic cricket page.
    if(!canonical || !normalize(title).includes(normalize(team.name))) return null;
    if(url.protocol!=='https:' || !['img1.hscicdn.com','img2.hscicdn.com','img3.hscicdn.com'].includes(url.hostname)) return null;
    if(!url.pathname.includes('/lsci/db/PICTURES/')) return null;
    // A social preview alone could be generic artwork. Require an identity-
    // labelled team image using the same exact provider image path as well.
    const picturePath=url.pathname.slice(url.pathname.indexOf('/lsci/'));
    const labelled=$('img').toArray().some(img=>{
      const alt=normalize($(img).attr('alt'));
      const src=$(img).attr('src') || $(img).attr('data-src') || '';
      return alt.includes(normalize(team.name)) && src.includes(picturePath);
    });
    if(!labelled) return null;
    return {id:String(team.id),name:team.name,url:url.href,source:page.href};
  } catch {return null;}
}
export async function discoverTeamLogos(teams,transport=fetch) {
  const results=[];
  const unique=new Map(teams.filter(t=>/^\d+$/.test(String(t.id)) && t.name).map(t=>[`${t.id}:${t.name}`,t]));
  for(const team of unique.values()) {
    const slug=team.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
    const source=`https://www.espncricinfo.com/team/${slug}-${team.id}`;
    try {
      const r=await transport(source,{signal:AbortSignal.timeout(10000),redirect:'follow'});
      if(r.status!==200) {results.push({id:team.id,name:team.name,source,status:r.status,reason:'Primary page unavailable'});await r.body?.cancel();continue;}
      // Bounded text read: never buffer an unbounded page response.
      const chunks=[];let bytes=0;const reader=r.body?.getReader();
      if(reader) try {for(;;){const p=await reader.read();if(p.done)break;bytes+=p.value.byteLength;if(bytes>2097152){await reader.cancel();break;}chunks.push(Buffer.from(p.value));}} finally {reader.releaseLock();}
      const found=bytes<=2097152 ? parseTeamLogo(Buffer.concat(chunks).toString(),team,r.url || source) : null;
      results.push(found ? {...found,status:200} : {id:team.id,name:team.name,source,status:200,reason:'No identity-bound logo metadata within page size limit'});
    } catch(err) {results.push({id:team.id,name:team.name,source,status:null,reason:err.message});}
  }
  return results;
}
