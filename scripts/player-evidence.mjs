import { load } from 'cheerio';
import { portraitCandidate } from '../src/player-portrait.js';
import { inspectPortrait } from '../src/player-portrait.js';
import { createHash } from 'node:crypto';

// Build-time live evidence only. Never expose raw source bodies or biographies
// through a diagnostic HTTP endpoint. Failures are visible, not substituted.
export async function verifyPlayerProfiles(base) {
  const rows = [];
  for (const id of ['253802', '277906', '28081', '1070173', '300631', '1070183', '597806', '604302']) {
    try {
      const res = await fetch(`${base}/espn/player/${id}`, { signal: AbortSignal.timeout(30000) });
      const json = await res.json();
      const p = json.result?.player;
      const row = { id, status: res.status, cacheControl: res.headers.get('cache-control'),
        playerId: p?.playerId, name: p?.name, birthDate: p?.personalInfo?.birthDate,
        careerPlayerId: p?.careerPlayerId, careerSourceUrl: p?.careerSourceUrl,
        biographyCharacters: p?.biography?.length || 0,
        biographySha256: p?.biography ? createHash('sha256').update(p.biography).digest('hex') : null,
        batting: p?.careerStats?.batting?.formats || null,
        bowling: p?.careerStats?.bowling?.formats || null,
        imageUrl: p?.imageUrl ?? null, coverage: p?.careerCoverage,
      };
      if (['253802', '597806'].includes(id)) {
        try {
          const identity = await (await fetch(`https://site.web.api.espn.com/apis/common/v3/sports/cricket/200/athletes/${id}`)).json();
          const candidate = portraitCandidate(identity, id);
          console.log('PORTRAIT_SOURCE_EVIDENCE ' + JSON.stringify({ id, headshot: identity.athlete?.headshot, candidate,
            validation: candidate ? await inspectPortrait(candidate) : null }));
          if (p?.careerSourceUrl) {
            const html = await (await fetch(p.careerSourceUrl)).text();
            const $ = load(html);
            console.log('PORTRAIT_PAGE_EVIDENCE ' + JSON.stringify({ id,
              images: $('img').toArray().slice(0, 12).map(i => ({ alt: $(i).attr('alt'), src: $(i).attr('src'), dataSrc: $(i).attr('data-src') })),
              ogImage: $('meta[property="og:image"]').attr('content') }));
          }
        } catch (e) { console.log('PORTRAIT_RESEARCH_ERROR ' + JSON.stringify({id,error:e.message})); }
      }
      row.portraitValidation = p?.imageUrl ? await inspectPortrait(p.imageUrl) : null;
      row.passed = res.status === 200 && p?.playerId === id && p?.provider === 'espn'
        && res.headers.get('cache-control') === 'no-store' && (!p?.imageUrl || row.portraitValidation?.valid)
        && row.biographyCharacters > 0 && !!row.batting?.length && !!row.bowling?.length;
      rows.push(row);
    } catch (e) { rows.push({ id, passed: false, error: e.message }); }
  }
  for (const row of rows) console.log('PLAYER_PROFILE_EVIDENCE ' + JSON.stringify(row));
  const report = { checkedAt: new Date().toISOString(), passed: rows.every((r) => r.passed), covered: rows.filter((r) => r.passed).length, total: rows.length };
  console.log('PLAYER_PROFILE_SUMMARY ' + JSON.stringify(report));
  try {
    const res = await fetch(`${base}/espn/match/1557451/scorecard?league=1557442&date=20261128`, { signal: AbortSignal.timeout(30000) });
    const body = await res.json();
    const innings = body.result?.innings || [];
    console.log('REPORTED_SCORECARD_EVIDENCE ' + JSON.stringify({ status: res.status, matchId: body.result?.matchId,
      cacheControl: res.headers.get('cache-control'), innings: innings.map(i => ({ inningsId: i.inningsId, score: i.score,
        batters: i.batsmen?.length || 0, bowlers: i.bowlers?.length || 0 })),
      kusal: innings.flatMap(i => i.batsmen || []).filter(p => p.id === '300631').map(p => ({ id: p.id, runs: p.runs, balls: p.balls })) }));
  } catch (e) { console.log('REPORTED_SCORECARD_EVIDENCE ' + JSON.stringify({ error: e.message })); }
  return { ...report, rows };
}
