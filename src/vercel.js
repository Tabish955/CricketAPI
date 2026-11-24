// Vercel adapter: same req/res interface as Node's http module, so the core
// handler is reused as-is. Depending on how the request reaches the function
// (direct /api mount vs rewrite), req.url may be the original path
// (/cb/live) or carry the /api prefix (/api or /api/cb/live). None of our
// routes start with /api, so a leading mount is safe to strip.

import { handler } from './server.js';

function stripApiMount(req) {
  const u = req.url || '/';
  const qi = u.indexOf('?');
  const path = qi === -1 ? u : u.slice(0, qi);
  const qs = qi === -1 ? '' : u.slice(qi);
  if (path === '/api' || path.startsWith('/api/')) {
    req.url = (path.slice(4) || '/') + qs;
  }
}

export default function vercelHandler(req, res) {
  stripApiMount(req);
  return handler(req, res);
}
