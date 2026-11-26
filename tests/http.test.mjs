import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { fetchText } from '../src/http.js';

test('upstream timeout covers a stalled response body, not just response headers', async () => {
  const server = http.createServer((req,res) => { res.writeHead(200, { 'Content-Type':'application/json' }); res.write('{'); });
  await new Promise((r) => server.listen(0,'127.0.0.1',r));
  try {
    await assert.rejects(fetchText(`http://127.0.0.1:${server.address().port}`, { timeoutMs:100, retries:0 }), /timeout/);
  } finally { server.closeAllConnections(); await new Promise((r) => server.close(r)); }
});
