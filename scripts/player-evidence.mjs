import { createHash } from 'node:crypto';

// Build-time live evidence only. Never expose raw source bodies or biographies
// through a diagnostic HTTP endpoint. Failures are visible, not substituted.
export async function verifyPlayerProfiles(base) {
  const rows = [];
  for (const id of ['253802', '277906', '28081', '1070173']) {
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
  return { ...report, rows };
}
