import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createDesktopImport, stageDesktopImport } from '../server/desktop-import';

test('private desktop import stays encrypted, requires local authorization, and cleans up after commit', { skip: process.platform !== 'win32' }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'flashmap-private-import-test-'));
  const content = { title: 'Synthetic 私人 study map', nodes: [{ id: 'test-root', position: { x: 0, y: 0 }, data: { label: 'synthetic-personal-unique-marker 私人 ∑', question: 'Question', answer: '∑ᵢ₌₁ⁿ |yᵢ − ŷᵢ| 答案' } }], edges: [] };
  const app = express(); const imports = createDesktopImport(directory);
  app.post('/desktop/open', express.urlencoded({ extended: false }), imports.open);
  app.use('/api/desktop-import', imports.router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address(); assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;
  const send = (route: string, cookie = '', origin = base) => fetch(`${base}/api/desktop-import/${route}`, { method: 'POST', headers: { Origin: origin, Cookie: cookie } });
  try {
    const metadata = await stageDesktopImport(content, directory);
    assert.equal(metadata.nodeCount, 1);
    assert.equal((await readFile(path.join(directory, 'desktop-import.dpapi'), 'utf8')).includes(content.nodes[0].data.label), false);
    await assert.rejects(stageDesktopImport(content, directory), { code: 'EEXIST' });
    let response = await send('read'); assert.deepEqual(await response.json(), { transfer: null });
    response = await send('read', '', 'https://untrusted.example'); assert.equal(response.status, 403);
    const html = await readFile(path.join(directory, 'desktop-import.html'), 'utf8');
    const ticket = html.match(/name="ticket" value="([a-f0-9]{64})"/)?.[1]; assert.ok(ticket);
    const open = (value: string, origin = 'null') => fetch(`${base}/desktop/open`, { method: 'POST', redirect: 'manual', headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ticket: value }) });
    response = await open('0'.repeat(64)); assert.equal(response.status, 403);
    response = await open(ticket, 'https://untrusted.example'); assert.equal(response.status, 403);
    response = await open(ticket); assert.equal(response.status, 303); assert.equal(response.headers.get('Location'), '/');
    const cookie = response.headers.get('set-cookie')!;
    assert.ok(cookie.includes('HttpOnly')); assert.ok(cookie.includes('SameSite=Strict'));
    response = await send('read', cookie.split(';')[0]);
    const result = await response.json(); assert.equal(result.transfer.id, metadata.id); assert.equal(result.transfer.title, content.title); assert.equal(result.transfer.nodes[0].data.label, content.nodes[0].data.label); assert.equal(result.transfer.nodes[0].data.answer, content.nodes[0].data.answer); assert.equal(result.transfer.ticket, undefined);
    response = await send('complete'); assert.equal(response.status, 403);
    response = await send('complete', cookie.split(';')[0]); assert.equal(response.status, 200);
    await assert.rejects(stat(path.join(directory, 'desktop-import.dpapi')), { code: 'ENOENT' });
    await assert.rejects(stat(path.join(directory, 'desktop-import.html')), { code: 'ENOENT' });
    const receipt = JSON.parse(await readFile(path.join(directory, 'desktop-import-receipt.json'), 'utf8'));
    assert.equal(receipt.id, metadata.id); assert.equal(receipt.nodeCount, 1); assert.equal(JSON.stringify(receipt).includes(ticket), false);
    response = await send('read', cookie.split(';')[0]); assert.deepEqual(await response.json(), { transfer: null });
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
