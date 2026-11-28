// Fixture registry: recorded upstream responses collected from public
// open-source projects (see docs/REVERSE-ENGINEERING.md for provenance).
// Used when DATA_MODE=fixtures, and as fallback in DATA_MODE=auto.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(HERE, '..', 'fixtures');

const registry = new Map();
const cache = new Map();

// key -> fixture file. `:<id>` keys are exact-id matches; bare keys are generic.
const FILES = {
  'espn.player:253802': 'espn-player-253802.json',
  'espn.live': 'espn-live.json',
  'espn.recent': 'espn-recent.json',
  'espn.upcoming': 'espn-upcoming.json',
  'espn.series:24484': 'espn-recent.json',
  'espn.standings:20921': 'espn-standings-ilt20.json',
  'cb.live': 'cricbuzz-live.json',
  'cb.recent': 'cricbuzz-recent.json',
  'cb.upcoming': 'cricbuzz-upcoming.json',
  'cb.scorecard:53373': 'cricbuzz-scorecard.json',
  'cb.liveScore:153780': 'cricbuzz-live-score.json',
  'cb.commentary:152097': 'cricbuzz-commentary.json',
  // For match 20717 only the legacy cbzios commentary was captured.
  'cb.commentary:20717': 'cbzios-commentary.json',
  'cbzios.live': 'cbzios-livematches.json',
  'cbzios.match:20717': 'cbzios-match-summary.json',
  'cbzios.commentary:20717': 'cbzios-commentary.json',
  // Recorded from Perarivalan-Ganapathi/Cricbuzz-LivStats jsons/partnership/135096_odi.json
  'cbzios.scorecard:135096': 'cbzios-scorecard.json',
  'cricinfo.current': 'cricinfo-current.json',
};

// When an exact-id fixture is missing, these generic fixtures are substituted.
// Substitution is always flagged in the response meta (substitutedForId).
const GENERIC = {
  'cb.scorecard': 'cricbuzz-scorecard.json',
  'cb.liveScore': 'cricbuzz-live-score.json',
  'cb.commentary': 'cricbuzz-commentary.json',
  'cbzios.match': 'cbzios-match-summary.json',
  'cbzios.commentary': 'cbzios-commentary.json',
  'cbzios.scorecard': 'cbzios-scorecard.json',
};

function load(file) {
  if (cache.has(file)) return cache.get(file);
  const raw = readFileSync(join(FIXTURE_DIR, file), 'utf8');
  const value = JSON.parse(raw);
  cache.set(file, value);
  return value;
}

/**
 * Resolve a fixture for an operation.
 * @returns {{ data: any, file: string, substitutedForId?: string } | null}
 */
export function resolveFixture(op, id) {
  const exact = id !== undefined && id !== null && FILES[`${op}:${id}`];
  if (exact) return { data: load(FILES[`${op}:${id}`]), file: FILES[`${op}:${id}`] };
  const bare = FILES[op];
  if (bare) return { data: load(bare), file: bare };
  const genericOp = op.replace(/:[^:]+$/, '');
  if (id !== undefined && id !== null && GENERIC[genericOp]) {
    const file = GENERIC[genericOp];
    return { data: load(file), file, substitutedForId: String(id) };
  }
  if (GENERIC[op]) {
    const file = GENERIC[op];
    return { data: load(file), file };
  }
  return null;
}

export function fixtureIds() {
  return Object.keys(FILES);
}
