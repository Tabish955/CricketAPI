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
      row.passed = res.status === 200 && p?.playerId === id && p?.provider === 'espn'
        && res.headers.get('cache-control') === 'no-store' && p?.imageUrl === null
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
