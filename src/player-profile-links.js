// Deliberately small, reviewed cross-provider registry, not a name search.
// Each URL was read from the provider's published player profile. Both live
// identities must also match the reviewed names and DOB before career import.
// Evidence and coverage limits: docs/PLAYER-CAREER.md.
export const playerProfileLinks = Object.freeze({
  '300631': { cricbuzzId: '8116', url: 'https://www.cricbuzz.com/profiles/8116/kusal-perera', names: ['Kusal Perera', 'Mathurage Don Kusal Janith Perera'], born: '1990-08-17' },
  '253802': { cricbuzzId: '1413', url: 'https://www.cricbuzz.com/profiles/1413/virat-kohli', names: ['Virat Kohli'], born: '1988-11-05' },
  '277906': { cricbuzzId: '6326', url: 'https://www.cricbuzz.com/profiles/6326/kane-williamson', names: ['Kane Williamson', 'Kane Stuart Williamson'], born: '1990-08-08' },
  '28081': { cricbuzzId: '265', url: 'https://www.cricbuzz.com/profiles/265/ms-dhoni', names: ['MS Dhoni', 'Mahendra Singh Dhoni'], born: '1981-07-07' },
  '1070173': { cricbuzzId: '11808', url: 'https://www.cricbuzz.com/profiles/11808/shubman-gill', names: ['Shubman Gill'], born: '1999-09-08' },
});

export function reviewedCricbuzzUrl(id) {
  return Object.values(playerProfileLinks).find((p) => p.cricbuzzId === String(id))?.url ?? null;
}
