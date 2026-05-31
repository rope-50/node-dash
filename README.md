# 🎬 Node Dash

> A from-scratch **MPEG-DASH** video player: a custom [Media Source Extensions](https://developer.mozilla.org/docs/Web/API/Media_Source_Extensions_API) client in vanilla JavaScript, on top of a small Node/Express server that fetches, normalizes, and proxies adaptive streams. No playback library, no jQuery, no UI framework.

[![Node](https://img.shields.io/badge/node-%E2%89%A518-43853d?logo=node.js&logoColor=white)](https://nodejs.org)
[![Built with Vite](https://img.shields.io/badge/built%20with-vite-646CFF?logo=vite&logoColor=white)](https://vitejs.dev)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Node Dash plays adaptive (DASH) video the way a browser-based player has to:
it reads the **MPD manifest**, downloads the **initialization segment** and the
**`sidx` index**, then pulls each media segment by **HTTP byte-range** and feeds
it into a `MediaSource` / `SourceBuffer`. It recreates the YouTube-style
experience (a loading bar, buffering pauses, adaptive-quality labels) with zero
frontend runtime dependencies.

## How it works

The browser client and the Node server cooperate over two endpoints:

1. The client requests `GET /dash/manifest?src=<mpd>`. The server fetches and
   parses the MPD (xml2js), normalizes it, rewrites media URLs through the
   proxy, synthesizes the missing initialization byte-range, and returns the
   representation list as JSON.
2. The client downloads the init segment, the `sidx` index, and each media
   segment via `GET /dash/proxy?url=...` with a `Range: bytes=...` header. The
   allowlisted, range-aware proxy streams back `206 Partial Content`.
3. The client appends those byte ranges to a single `MediaSource` (one video and
   one audio `SourceBuffer`) for playback.

## Project structure

```
client/                 browser app, bundled by Vite
  index.html
  src/
    main.js             bootstrap
    player.js           DashPlayer class (orchestrator)
    sidx.js             sidx (segment index) binary parser
    manifest.js         load + classify representations
    segment-loader.js   byte-range fetch
    source-buffer.js    MSE SourceBuffer append queue
    scheduler.js        playback plan + timeline
    ui/                 controls + inline SVG icons
    styles.css
server/
  index.js              Express app (API + serves the client)
  config.js             default stream + host allowlist
  dash.js               manifest fetch / normalize / allowlist
tests/                  Vitest specs (server + pure client logic)
```

The client is plain ES modules (ES classes, native DOM, native `fetch`) with no
runtime dependencies. The server is Node/Express with `xml2js`.

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000 (Vite middleware + HMR)
```

For a production build:

```bash
npm run build      # bundles the client into dist/
npm start          # serves dist/ + the API on http://localhost:3000
```

Open the page in a browser that supports the stream's codecs (H.264 / AAC).
**Google Chrome** is recommended. The default stream is a public
[DASH-IF](https://dashif.org) test vector.

Play a different DASH source (it must use the on-demand `SegmentBase` + `sidx`
model) by adding its host to `ALLOWED_HOSTS` in
[`server/config.js`](server/config.js), then visiting `/?src=<manifest-url>`.

## Tests

```bash
npm test           # Vitest
```

Covers the server (manifest normalization, init-range synthesis, allowlist) and
the pure client logic (the `sidx` parser and the scheduler). The MSE player
itself runs only in a browser.

## A note on history

Node Dash began as an experiment that streamed **YouTube** videos by reading
their DASH manifest. YouTube has since removed that mechanism (`get_video_info`
and the single `dashmpd` URL are gone, replaced by ciphered signatures), so the
project was refactored into a **general-purpose DASH player** that plays any
standard on-demand DASH stream. The browser client was later rewritten from a
jQuery/prototype script into vanilla ES modules with a Vite build.

## Credits

Originally created by **Rodrigo Urbina**. Released under the [MIT License](LICENSE).
