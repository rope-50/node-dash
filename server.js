/**
 * Node Dash server.
 *
 * Serves the player page and exposes two endpoints the browser client uses:
 *   GET /dash/manifest?src=<mpd>  -> normalized representation list (JSON)
 *   GET|HEAD /dash/proxy?url=<u>  -> range-aware, allowlisted media proxy
 *
 * The proxy lets the browser fetch media through our own origin (no CORS) and is
 * restricted to ALLOWED_HOSTS so it cannot be abused as an open relay.
 */

import express from 'express';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { DEFAULT_MANIFEST } from './src/config.js';
import { fetchManifest, normalizeManifest, buildVideoData, isAllowedUrl } from './src/dash.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const app = express();
app.set('views', join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(express.static(join(__dirname, 'public')));

// Home page: prepare a default playback descriptor and render the player.
app.get('/', async (req, res) => {
  const manifestSrc = typeof req.query.src === 'string' ? req.query.src : DEFAULT_MANIFEST;
  let videoData = null;
  try {
    if (!isAllowedUrl(manifestSrc)) throw new Error('manifest host not allowed');
    const reps = normalizeManifest(await fetchManifest(manifestSrc), manifestSrc);
    videoData = buildVideoData(manifestSrc, reps);
  } catch (err) {
    console.error('Could not prepare manifest:', err.message);
  }
  res.render('index', { videoData });
});

// Representation list consumed by the client.
app.get('/dash/manifest', async (req, res) => {
  const src = typeof req.query.src === 'string' ? req.query.src : DEFAULT_MANIFEST;
  if (!isAllowedUrl(src)) {
    return res.status(400).json({ error: 'manifest host not allowed' });
  }
  try {
    const reps = normalizeManifest(await fetchManifest(src), src);
    res.json(reps);
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
    // Stream the upstream body straight to the client.
    Readable.fromWeb(upstream.body).pipe(res);
  } catch {
    res.status(502).send('upstream error');
  }
}
app.get('/dash/proxy', proxyMedia);
app.head('/dash/proxy', proxyMedia);

app.listen(PORT, () => {
  console.log(`Node Dash running on http://localhost:${PORT}`);
});

export { app };
