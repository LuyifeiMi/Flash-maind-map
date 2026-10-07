import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { createApiRouter } from './server/api';
import { createDesktopImport } from './server/desktop-import';

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (process.env.NODE_ENV === 'production') res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'none'");
    next();
  });
  app.use((req, res, next) => ['localhost', '127.0.0.1'].includes(req.hostname) ? next() : res.sendStatus(403));
  app.use(express.json({ limit: '100kb' }));
  const desktopImport = createDesktopImport();
  app.post('/desktop/open', express.urlencoded({ extended: false, limit: '1kb' }), desktopImport.open);
  app.use('/api/desktop-import', desktopImport.router);
  app.use('/api', createApiRouter());
  app.use('/api', (_req, res) => res.status(404).json({ error: '接口不存在' }));
  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use((req, res, next) => /\.(cjs|map)$/i.test(req.path) ? res.sendStatus(404) : next());
    app.use(express.static(distPath));
    app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }
  app.use((error: { type?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error.type === 'entity.too.large' ? 413 : 400).json({ error: '请求格式或大小无效' });
  });
  const server = app.listen(port, '127.0.0.1', () => {
    console.log('FlashMap running on port ' + port);
  });
  server.on('error', () => { console.error('FlashMap could not start. The local port may be occupied.'); process.exitCode = 1; });
}
startServer().catch(() => { console.error('FlashMap failed to start. Check server configuration.'); process.exitCode = 1; });
