/**
 * Dash Player server.
 *
 * Exposes the two endpoints the browser client uses and serves the client:
 *   GET      /dash/manifest?src=<mpd>  -> normalized representation list (JSON)
 *   GET|HEAD /dash/proxy?url=<u>       -> range-aware, allowlisted media proxy
 *
 * The proxy lets the browser fetch media through our own origin (no CORS) and is
 * restricted to ALLOWED_HOSTS so it cannot be abused as an open relay.
 *
 * In development the client is served by Vite in middleware mode (one process,
 * HMR). In production (`--prod`) the prebuilt `dist/` is served statically.
 */

import express from 'express';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { DEFAULT_MANIFEST } from './config.js';
import { fetchManifest, normalizeManifest, isAllowedUrl } from './dash.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PORT = process.env.PORT || 3000;
const PROD = process.argv.includes('--prod');

const app = express();

// Representation list consumed by the client.
app.get('/dash/manifest', async (req, res) => {
  const src = typeof req.query.src === 'string' ? req.query.src : DEFAULT_MANIFEST;
  if (!isAllowedUrl(src)) {
    return res.status(400).json({ error: 'manifest host not allowed' });
  }
  try {
    res.json(normalizeManifest(await fetchManifest(src), src));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Range-aware media proxy (CORS bypass), restricted to the allowlist.
async function proxyMedia(req, res) {
  const target = req.query.url;
  if (typeof target !== 'string' || !isAllowedUrl(target)) {
    return res.status(400).send('blocked URL');
  }

  const headers = {};
  if (req.headers.range) headers.Range = req.headers.range;

  try {
    const upstream = await fetch(target, { method: req.method, headers });
    res.status(upstream.status);
    for (const header of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
      const value = upstream.headers.get(header);
      if (value) res.setHeader(header, value);
    }
    if (req.method === 'HEAD' || !upstream.body) {
      return res.end();
    }
    Readable.fromWeb(upstream.body).pipe(res);
  } catch {
    res.status(502).send('upstream error');
  }
}
app.get('/dash/proxy', proxyMedia);
app.head('/dash/proxy', proxyMedia);

// Serve the client: built assets in production, Vite middleware in development.
if (PROD) {
  app.use(express.static(join(ROOT, 'dist')));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({
    root: join(ROOT, 'client'),
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
}

app.listen(PORT, () => {
  console.log(`Dash Player running on http://localhost:${PORT} (${PROD ? 'prod' : 'dev'})`);
});
