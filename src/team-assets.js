import {candidateLogo} from './team-logo-registry.js';
import { nationalFlag } from './national-flags.js';
import { readFileSync } from 'node:fs';
const verifiedExclusions = JSON.parse(readFileSync(new URL('./verified-asset-exclusions.json', import.meta.url), 'utf8'));
// Exact dead references reported by the consuming production origin on 2026-11-26.
// These are URL exclusions, NOT a remapping of provider IDs. No substitute is guessed.
export const rejectedCrests = new Map(['1346027', '1336141', '1336151', '3161'].map((id) => [
  `https://a.espncdn.com/i/teamlogos/cricket/500/${id}.png`,
  { id, status: 404, evidence: 'Cricline production-origin probes supplied by user, 2026-11-26; not independently reproduced in sandbox' },
]));

export function applyVerifiedExclusions(entries) {
  for (const entry of entries) rejectedCrests.set(entry.url, entry);
}
applyVerifiedExclusions(verifiedExclusions);

let validatedAssets = JSON.parse(readFileSync(new URL('./validated-assets.json', import.meta.url), 'utf8'));
export function applyValidatedAssets(entries) { validatedAssets = entries; }
function allowed(url) {
  if (typeof url !== 'string' || !url.startsWith('https://')) return null;
  return process.env.ASSET_DISCOVERY === '1' || validatedAssets[url]?.verdict === 'green' ? url : null;
}
export function teamAssets(team) {
  if (!team || typeof team !== 'object') return team;
  const imageUrl = typeof team.imageUrl === 'string' && team.imageUrl.trim() && !rejectedCrests.has(team.imageUrl)
    ? team.imageUrl : null;
  // Country identity is explicit; the transport manifest must independently pass.
  return { ...team, imageUrl: allowed(imageUrl) || allowed(candidateLogo(team)), flagUrl: allowed(nationalFlag(team)) };
}

// Apply at the shared JSON boundary so fallback providers and standings cannot
// bypass the same team-asset policy. Don't rewrite player portrait references.
export function sanitizeTeamPayload(value) {
  if (Array.isArray(value)) return value.map(sanitizeTeamPayload);
  if (!value || typeof value !== 'object') return value;
  const out = Object.fromEntries(Object.entries(value).map(([key, v]) => [key,
    ['team', 'team1', 'team2'].includes(key) && v && typeof v === 'object' && !Array.isArray(v)
      ? teamAssets(sanitizeTeamPayload(v)) : sanitizeTeamPayload(v),
  ]));
  if (out.teamId != null && typeof out.teamName === 'string' && (Array.isArray(out.players) || Array.isArray(out.squad))) {
    out.flagUrl = allowed(nationalFlag({name:out.teamName}));
  }
  if (Array.isArray(out.scores)) {
    const teams = [out.team1, out.team2].filter(Boolean);
    out.scores = out.scores.map((score) => {
      if (score.teamId != null) return score;
      const matches = teams.filter((t) => [t.name, t.short].filter(Boolean).includes(score.team));
      return { ...score, teamId: matches.length === 1 && matches[0].id ? String(matches[0].id) : null };
    });
  }
  return out;
}
