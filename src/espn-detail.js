// Observed ESPN summary notes[type=toss] and gameInfo.officials.
// No commentary parsing, nationality inference or editorial pitch generation.
const value = v => typeof v === 'string' && v.trim() ? v : null;
export function normalizeEspnDetail(raw, teams) {
  const notes = (Array.isArray(raw.notes) ? raw.notes : []).filter(n => n.type === 'toss');
  let toss = null;
  if (notes.length === 1) {
    const m = value(notes[0].text)?.match(/^(.+?)\s*,\s*elected to (bat|field) first$/);
    if (m) {
      const winners = teams.filter(t => t?.id && t.name === m[1].trim());
      if (winners.length === 1) toss = { winnerTeamId: winners[0].id, choice: m[2] };
    }
  }
  const rows = Array.isArray(raw.gameInfo?.officials) ? raw.gameInfo.officials : [];
  const names = role => [...new Set(rows.filter(o => o.position?.name === role).map(o => value(o.displayName)).filter(Boolean))];
  const umpires = names('umpire'), tv = names('tv umpire'), referees = names('referee');
  const officials = umpires.length || tv.length || referees.length ? {
    umpires: umpires.length ? umpires : null,
    tvUmpire: tv.length === 1 ? tv[0] : null,
    referee: referees.length === 1 ? referees[0] : null,
  } : null;
  // No sanctioned structured pitch note observed. Do not mistake the venue's
  // address.summary for a pitch report.
  return { toss, officials, pitch: null };
}

export function confirmedXI(rows) {
  // Count unique identified players too: duplicated rows cannot confirm an XI.
  return rows.length === 11 && rows.every(p => p.starter === true && p.athlete?.id)
    && new Set(rows.map(p => String(p.athlete.id))).size === 11 ? true : null;
}
export function playerRole(v) {
  return typeof v === 'string' && v.trim() && v.trim().toLowerCase() !== 'unknown' ? v.trim() : null;
}
