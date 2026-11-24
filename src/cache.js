// Tiny TTL cache with single-flight de-duplication.
// Keeps us polite toward upstreams: concurrent callers share one request.

const store = new Map(); // key -> { value, expiresAt }
const inflight = new Map(); // key -> Promise

export function cacheGet(key) {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (Date.now() > hit.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return hit.value;
}

export function cacheSet(key, value, ttlSeconds) {
  store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  return value;
}

/** Deduplicate concurrent work for the same key. */
export async function singleFlight(key, fn) {
  const existing = inflight.get(key);
  if (existing) return existing;
  const p = (async () => {
    try {
      return await fn();
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

/** Cached + single-flighted fetch helper. */
export async function cached(key, ttlSeconds, fn) {
  const hit = cacheGet(key);
  if (hit !== undefined) return { ...hit, meta: { ...hit.meta, cached: true } };
  return singleFlight(key, async () => {
    const fresh = cacheGet(key);
    if (fresh !== undefined) return { ...fresh, meta: { ...fresh.meta, cached: true } };
    const result = await fn();
    if (result && result.meta) result.meta.cached = false;
    cacheSet(key, result, ttlSeconds);
    return result;
  });
}

export function cacheClear() {
  store.clear();
}
