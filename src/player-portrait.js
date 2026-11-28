import { cached } from './cache.js';

const MAX_BYTES = 204800;
// Only an observed provider-published portrait, never a constructed ID template.
export function portraitCandidate(raw, id) {
  if (String(raw?.athlete?.id) !== String(id)) return null;
  const photo = raw.athlete.headshot;
  if (photo?.rel?.includes('default')) return null;
  try {
    const u = new URL(photo?.href);
    if (u.origin !== 'https://a.espncdn.com' || u.username || u.password || u.search || u.hash
      || !new RegExp(`^/i/headshots/cricket/players/(?:full|[0-9]+)/${id}\\.(?:png|jpg|jpeg)$`).test(u.pathname)) return null;
    return u.href;
  } catch { return null; }
}

/** Every non-null portrait requires a measured GET, HTTP 200, image MIME,
 * positive body <=200KB, no redirects. Negative results are cached briefly.
 * No header spoofing, generated paths or placeholder image substitution.
 */
export async function inspectPortrait(url, transport = fetch) {
  try {
    const r = await transport(url, { redirect: 'error', signal: AbortSignal.timeout(8000) });
    const mime = r.headers.get('content-type');
    if (r.status !== 200 || !/^image\//i.test(mime || '')) { await r.body?.cancel(); return { valid: false, status: r.status, mime }; }
    let bytes = 0;
    const reader = r.body?.getReader();
    if (reader) try {
      for (;;) {
        const p = await reader.read(); if (p.done) break;
        bytes += p.value.byteLength;
        if (bytes > MAX_BYTES) { await reader.cancel(); break; }
      }
    } finally { reader.releaseLock(); }
    return { valid: bytes > 0 && bytes <= MAX_BYTES, status: r.status, mime, bytes };
  } catch { return { valid: false, status: null }; }
}
export async function verifiedPlayerPortrait(raw, id, inspect = inspectPortrait) {
  const url = portraitCandidate(raw, id);
  if (!url) return null;
  // Cache only transport evidence, not a cross-player identity decision.
  const { data } = await cached(`portrait:${url}`, 300, async () => ({ data: await inspect(url), meta: {} }));
  return data.valid ? url : null;
}

// Call only after independent profile ID/name/DOB checks have passed.
export async function verifiedCricbuzzPortrait(cb, id, inspect = inspectPortrait) {
  if (!cb?.found || cb.publishedPlayerId !== String(id) || cb.playerId !== String(id)) return null;
  try {
    const u = new URL(cb.portraitCandidate);
    if (u.origin !== 'https://static.cricbuzz.com' || u.username || u.password || u.hash
      || !/^\/a\/img\/v1\/(?:[a-z0-9x]+\/)?i1\/c[1-9]\d*\//i.test(u.pathname)) return null;
    const { data } = await cached(`portrait:${u.href}`, 300, async () => ({ data: await inspect(u.href), meta: {} }));
    return data.valid ? u.href : null;
  } catch { return null; }
}
