import express from 'express';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { dpapi } from './key-store';
import { parseGraph } from '../src/lib/graph';

export const desktopDataDirectory = () => path.join(process.env.LOCALAPPDATA || process.cwd(), 'FlashMap');
type Transfer = { ticket: string; id: string; title: string; nodes: unknown[]; edges: unknown[] };
const matches = (a: string, b: string) => /^[a-f0-9]{64}$/.test(a) && /^[a-f0-9]{64}$/.test(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function stageDesktopImport(value: unknown, directory = desktopDataDirectory()) {
  const graph = parseGraph(value);
  const title = (value as { title?: unknown }).title;
  if (typeof title !== 'string' || !title.trim()) throw new Error('A title is required');
  const transfer: Transfer = { ticket: randomBytes(32).toString('hex'), id: randomUUID(), title: title.trim().slice(0, 100), ...graph };
  const encrypted = await dpapi(JSON.stringify(transfer), 'Protect');
  await mkdir(directory, { recursive: true });
  // Refuse to discard an unfinished personal import.
  await writeFile(path.join(directory, 'desktop-import.dpapi'), encrypted, { flag: 'wx', mode: 0o600 });
  const nonce = randomBytes(18).toString('base64');
  const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; form-action http://localhost:3000"><title>FlashMap 私人导入</title><body><p>正在将私人导图加入桌面版…</p><form method="post" action="http://localhost:3000/desktop/open"><input type="hidden" name="ticket" value="${transfer.ticket}"></form><script nonce="${nonce}">document.forms[0].submit()</script></body></html>`;
  try { await writeFile(path.join(directory, 'desktop-import.html'), html, { flag: 'wx', mode: 0o600 }); }
  catch { await rm(path.join(directory, 'desktop-import.dpapi'), { force: true }); throw new Error('Desktop transfer could not be prepared'); }
  // Return only non-sensitive metadata; never print tickets or study material.
  return { id: transfer.id, nodeCount: graph.nodes.length };
}

export function createDesktopImport(directory = desktopDataDirectory()) {
  const filename = path.join(directory, 'desktop-import.dpapi');
  let cached: Transfer | undefined;
  const progress = async (stage: string) => {
    try { await writeFile(path.join(directory, 'desktop-import-progress.json'), JSON.stringify({ stage }), { mode: 0o600 }); }
    catch { /* Diagnostics never prevent saving personal data. */ }
  };
  const load = async () => {
    if (!cached) {
      const value = JSON.parse(await dpapi(await readFile(filename, 'utf8'), 'Unprotect')) as Transfer;
      if (!/^[a-f0-9]{64}$/.test(value.ticket) || typeof value.id !== 'string' || typeof value.title !== 'string') throw new Error('Invalid transfer');
      cached = { ...value, ...parseGraph(value) };
    }
    return cached;
  };
  const open: express.RequestHandler = async (req, res) => {
    await progress('bootstrap-received');
    res.setHeader('Cache-Control', 'no-store');
    if (!['localhost', '127.0.0.1'].includes(req.hostname) || !['null', `http://${req.headers.host}`].includes(req.headers.origin || '')) { await progress('origin-rejected'); res.sendStatus(403); return; }
    try {
      const transfer = await load();
      if (typeof req.body?.ticket !== 'string' || !matches(req.body.ticket, transfer.ticket)) { await progress('authorization-rejected'); res.sendStatus(403); return; }
      // A local bootstrap file grants this window a short-lived HttpOnly import cookie.
      // No private note or AI key enters the browser URL or command line.
      res.cookie('flashmap-private-import', transfer.ticket, { httpOnly: true, sameSite: 'strict', path: '/api/desktop-import', maxAge: 5 * 60_000 });
      await progress('desktop-authorized');
      res.redirect(303, '/');
    } catch { await progress('bootstrap-unavailable'); res.status(410).send('Private import is unavailable. Reopen FlashMap from the desktop shortcut.'); }
  };
  const router = express.Router();
  router.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!['localhost', '127.0.0.1'].includes(req.hostname) || req.headers.origin !== `http://${req.headers.host}` || req.headers['sec-fetch-site'] === 'cross-site') { res.sendStatus(403); return; }
    next();
  });
  const authorized = async (req: express.Request) => {
    const ticket = req.headers.cookie?.split(';').map(item => item.trim()).find(item => item.startsWith('flashmap-private-import='))?.slice('flashmap-private-import='.length);
    if (!ticket) return null;
    const transfer = await load();
    return matches(ticket, transfer.ticket) ? transfer : null;
  };
  router.post('/read', async (req, res) => {
    // Normal windows receive no material or metadata from another browser profile.
    if (!req.headers.cookie?.includes('flashmap-private-import=')) { res.json({ transfer: null }); return; }
    try {
      const transfer = await authorized(req);
      if (!transfer) { res.sendStatus(403); return; }
      const { ticket: _ticket, ...content } = transfer;
      await progress('delivered-to-desktop');
      res.json({ transfer: content });
    } catch { res.json({ transfer: null }); }
  });
  router.post('/complete', async (req, res) => {
    try {
      const transfer = await authorized(req);
      if (!transfer) { res.sendStatus(403); return; }
      // Called only after the desktop window verifies its localStorage commit.
      await writeFile(path.join(directory, 'desktop-import-receipt.json'), JSON.stringify({ id: transfer.id, nodeCount: transfer.nodes.length, completedAt: new Date().toISOString() }), { mode: 0o600 });
      await rm(filename, { force: true });
      await rm(path.join(directory, 'desktop-import.html'), { force: true });
      cached = undefined;
      await progress('saved-to-desktop');
      res.clearCookie('flashmap-private-import', { path: '/api/desktop-import', sameSite: 'strict' });
      res.json({ saved: true });
    } catch { res.status(503).json({ error: '导图已保存，但私人中转清理失败，请稍后重新打开应用。' }); }
  });
  return { open, router };
}
