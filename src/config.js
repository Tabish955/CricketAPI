// Central configuration: upstream bases, polite-fetch headers, cache TTLs.
// Header values observed in public open-source scrapers (see docs/REVERSE-ENGINEERING.md).

export const PORT = Number(process.env.PORT || 3000);

// live      -> always hit upstreams
// fixtures  -> never hit upstreams, serve recorded fixtures (offline demo/tests)
// auto      -> try live, fall back to fixtures when the upstream is unreachable
export const DATA_MODE = (process.env.DATA_MODE || 'auto').toLowerCase();
if (!['live', 'fixtures', 'auto'].includes(DATA_MODE)) {
  throw new Error(`DATA_MODE must be live|fixtures|auto, got ${DATA_MODE}`);
}

export const UPSTREAM_TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS || 8000);

export const BASES = {
  cricbuzz: 'https://www.cricbuzz.com',
  // Legacy mobile JSON API. Old public code uses plain http; https is attempted
  // first as an unverified convenience, http is the observed original.
  cricbuzzMappsHttps: 'https://mapps.cricbuzz.com',
  cricbuzzMappsHttp: 'http://mapps.cricbuzz.com',
  cricinfo: 'https://hs-consumer-api.espncricinfo.com',
};

// Browser-like headers + the custom header Cricbuzz's own web UI sends.
// Observed in Nayan0509/Livecricket1 cricket-live/api/scraper.js (apiHeaders).
export const CRICBUZZ_API_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://www.cricbuzz.com/',
  'x-cricbuzz-client': 'ui',
};

export const CRICBUZZ_HTML_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://www.cricbuzz.com/',
};

export const CRICINFO_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://www.espncricinfo.com/',
};

// In-memory cache TTLs (seconds). Keep these polite: upstreams rate-limit.
export const TTL = {
  live: 15,
  recent: 60,
  upcoming: 120,
  matchInfo: 30,
  liveScore: 10,
  scorecard: 60,
  commentary: 20,
  squads: 300,
  series: 120,
  pointsTable: 300,
  playerSearch: 3600,
  playerProfile: 86400,
  cricinfoList: 30,
  cricinfoDetail: 60,
};

// Hosts allowed through the /img proxy (SSRF guard).
export const IMG_ALLOWLIST = new Set([
  'static.cricbuzz.com',
  'www.cricbuzz.com',
  'cricbuzz.com',
  'i.cricketcb.com',
  'img1.hscicdn.com',
  'media.espncricinfo.com',
  'www.espncricinfo.com',
  'espncricinfo.com',
]);

export const IMG_MAX_BYTES = 3 * 1024 * 1024;
