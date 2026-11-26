// Minimal upstream HTTP client: timeouts, one retry, JSON/text helpers.
// Zero dependencies — plain global fetch (Node >= 18).

import { UPSTREAM_TIMEOUT_MS } from './config.js';

export class UpstreamError extends Error {
  constructor(message, { status = 0, url = '', cause } = {}) {
    super(message);
    this.name = 'UpstreamError';
    this.status = status;
    this.url = url;
    if (cause) this.cause = cause;
  }
}

async function attempt(url, { headers = {}, method = 'GET', timeoutMs } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs ?? UPSTREAM_TIMEOUT_MS);
  try {
    const res = await fetch(url, { method, headers, signal: controller.signal, redirect: 'follow' });
    // Keep the abort signal active until the response body is consumed.
    const text = await res.text();
    return { res, text };
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new UpstreamError(`upstream timeout after ${timeoutMs ?? UPSTREAM_TIMEOUT_MS}ms`, { url, cause: err });
    }
    throw new UpstreamError(`upstream network error: ${err.message}`, { url, cause: err });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * GET a URL with headers. Retries once on network failure (not on HTTP errors).
 * Returns { text, status, url }.
 */
export async function fetchText(url, { headers = {}, timeoutMs, retries = 1 } = {}) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      const { res, text } = await attempt(url, { headers, timeoutMs });
      if (!res.ok) {
        const err = new UpstreamError(`upstream HTTP ${res.status} for ${url}`, {
          status: res.status,
          url,
        });
        err.bodySnippet = text.slice(0, 300);
        throw err;
      }
      return { text, status: res.status, url };
    } catch (err) {
      lastErr = err;
      // HTTP errors (status != 0) are not retried; network/timeout errors are.
      if (err instanceof UpstreamError && err.status !== 0) throw err;
      if (i === retries) throw lastErr;
    }
  }
  throw lastErr;
}

export async function fetchJson(url, opts = {}) {
  const { text, status } = await fetchText(url, opts);
  try {
    return { json: JSON.parse(text), status, url: opts.finalUrl || url };
  } catch (err) {
    throw new UpstreamError(`upstream returned invalid JSON for ${url}: ${err.message}`, {
      status,
      url,
      cause: err,
    });
  }
}

/** Cricbuzz search endpoints answer JSONP; strip the callback wrapper. */
export function stripJsonp(text) {
  const trimmed = text.trim();
  if (!trimmed.startsWith('(') && !/^[a-zA-Z_$][\w$]*\s*\(/.test(trimmed)) return trimmed;
  const open = trimmed.indexOf('(');
  const close = trimmed.lastIndexOf(')');
  if (open === -1 || close === -1 || close < open) return trimmed;
  return trimmed.slice(open + 1, close).trim();
}
