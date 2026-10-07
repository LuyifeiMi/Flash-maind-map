import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createApiRouter } from '../server/api';
import type { KeyStore } from '../server/key-store';

test('desktop AI prompts for a key, protects configuration, and sanitizes provider failures', async () => {
  // Isolated synthetic store: no environment credentials or actual vault are read.
  let saved = '', remembered = false;
  const key = 'synthetic-test-key-1234567890';
  const keys: KeyStore = {
    get: async () => saved,
    set: async (value, remember) => { saved = value; remembered = remember; },
    clear: async () => { saved = ''; },
  };
  const app = express(); app.use(express.json());
  app.use('/api', createApiRouter(async (_kind, prompt) => {
    if (prompt === 'provider failure') throw new Error(`private-provider-error-${key}`);
    if (prompt === 'invalid credential') throw Object.assign(new Error(key), { status: 403 });
    if (prompt === 'invalid output') return '{}';
    return JSON.stringify({ label: '测试', question: '问题', answer: '答案' });
  }, keys));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address(); assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;
  const send = (route: string, body?: unknown, method = 'POST', headers = {}) => fetch(`${base}/api/${route}`, {
    method, headers: { 'Content-Type': 'application/json', Origin: base, ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const generate = (prompt: string) => send('generate', { kind: 'node', prompt });
  try {
    let response = await generate('hello'); assert.equal(response.status, 428); assert.equal((await response.json()).code, 'KEY_REQUIRED');
    response = await send('ai/key', { key, remember: true }, 'POST', { Origin: 'https://untrusted.example' }); assert.equal(response.status, 403);
    response = await send('ai/key', { key, remember: true }, 'POST', { Origin: '' }); assert.equal(response.status, 403);
    response = await send('ai/key', { key: 'too-short', remember: true }); assert.equal(response.status, 400);
    response = await send('ai/key', { key, remember: true }); assert.equal(response.status, 200); assert.equal(remembered, true);
    assert.equal((await response.text()).includes(key), false);
    response = await send('ai/status', undefined, 'GET');
    const status = await response.text(); assert.equal(status.includes(key), false); assert.equal(JSON.parse(status).configured, true);
    response = await send('generate', { kind: 'unknown', prompt: 'test' }); assert.equal(response.status, 400);
    response = await generate('x'.repeat(24001)); assert.equal(response.status, 400);
    response = await generate('api_key="synthetic-credential-value-1234567890"'); assert.equal(response.status, 400);
    response = await generate(key); assert.equal(response.status, 400);
    response = await generate('provider failure'); assert.equal(response.status, 502);
    const error = await response.text(); assert.equal(error.includes(key), false); assert.equal(error.includes('private-provider-error'), false);
    response = await generate('invalid output'); assert.equal(response.status, 502);
    response = await generate('invalid credential'); assert.equal(response.status, 401); assert.equal((await response.json()).code, 'KEY_INVALID');
    response = await generate('test'); assert.equal(response.status, 200); assert.equal(JSON.parse((await response.json()).text).label, '测试');
    const previousMode = process.env.NODE_ENV; process.env.NODE_ENV = 'production';
    try { response = await generate('test'); assert.equal(response.status, 200); }
    finally { if (previousMode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousMode; }
    response = await send('ai/key', undefined, 'DELETE'); assert.equal(response.status, 200);
    assert.equal(saved, ''); assert.equal((await (await send('ai/status', undefined, 'GET')).json()).configured, false);
    let last = 0;
    for (let i = 0; i < 12; i++) last = (await generate('test')).status;
    assert.equal(last, 429);
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});
