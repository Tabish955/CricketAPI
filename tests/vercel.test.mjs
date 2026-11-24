// Vercel entry-point tests: invoke the serverless handler directly with a
// mock req/res (same interface Vercel provides) — no listen() involved.

process.env.DATA_MODE = 'fixtures';

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const { default: vercelHandler } = await import('../api/index.js');

function mockRes() {
  return {
    statusCode: 0,
    headers: {},
    body: undefined,
    writeHead(code, headers) {
      this.statusCode = code;
      this.headers = headers || {};
      return this;
    },
    end(chunk) {
      if (chunk !== undefined && chunk !== null) this.body = chunk;
      return this;
    },
  };
}

async function call(url, { method = 'GET', headers = {} } = {}) {
  const req = { url, method, headers: { host: 'cricketapi.vercel.app', ...headers } };
  const res = mockRes();
  await vercelHandler(req, res);
  let body = res.body;
  if (typeof body === 'string' && body.startsWith('{')) body = JSON.parse(body);
  return { status: res.statusCode, headers: res.headers, body, req };
}

test('GET /cb/live through the vercel handler', async () => {
  const { status, body, req } = await call('/cb/live');
  assert.equal(status, 200);
  assert.equal(body.success, true);
  assert.ok(body.result.count >= 1);
  // original path preserved for self-referential links
  assert.ok(body.result.matches[0].detail.endsWith('/cb/match/' + body.result.matches[0].matchId));
  assert.equal(req.url, '/cb/live');
});

test('query strings survive the handler', async () => {
  const { status, body } = await call('/cb/search?q=AUS');
  assert.equal(status, 200);
  assert.equal(body.success, true);
  assert.equal(body.query, 'AUS');
});

test('requests arriving behind the /api mount are normalized', async () => {
  const a = await call('/api');
  assert.equal(a.status, 200);
  assert.equal(a.body.success, true);
  assert.ok(Array.isArray(a.body.endpoints), 'root index served at /api');

  const b = await call('/api/health?x=1');
  assert.equal(b.status, 200);
  assert.equal(b.body.status, 'ok');
});

test('OPTIONS preflight', async () => {
  const { status, headers } = await call('/cb/live', { method: 'OPTIONS' });
  assert.equal(status, 204);
  assert.equal(headers['Access-Control-Allow-Origin'], '*');
});

test('unknown route still 404s', async () => {
  const { status, body } = await call('/nope');
  assert.equal(status, 404);
  assert.equal(body.success, false);
});
