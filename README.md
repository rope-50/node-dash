# 🎬 Dash Player

> A from-scratch **MPEG-DASH** video player: a custom [Media Source Extensions](https://developer.mozilla.org/docs/Web/API/Media_Source_Extensions_API) client in vanilla JavaScript, on top of a small Node/Express server that fetches, normalizes, and proxies adaptive streams. No playback library, no jQuery, no UI framework.

[![Node](https://img.shields.io/badge/node-%E2%89%A518-43853d?logo=node.js&logoColor=white)](https://nodejs.org)
[![Built with Vite](https://img.shields.io/badge/built%20with-vite-646CFF?logo=vite&logoColor=white)](https://vitejs.dev)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Dash Player plays adaptive (DASH) video the way a browser-based player has to:
it reads the **MPD manifest**, downloads the **initialization segment** and the
media segments, and feeds them into a `MediaSource` / `SourceBuffer`. It supports
both DASH addressing models (`SegmentBase` byte-ranges and `SegmentTemplate`
files) and recreates the YouTube-style experience with zero frontend runtime
dependencies.

The default stream is **Big Buck Bunny**: it starts at the lowest quality
(180p), then performs a **real switch to 1080p** partway through so the jump in
sharpness is obvious, and simulates a brief buffering pause.

## How it works

The browser client and the Node server cooperate over two endpoints:

1. The client requests `GET /dash/manifest?src=<mpd>`. The server fetches and
   parses the MPD (xml2js), normalizes both `SegmentBase` and `SegmentTemplate`
   representations into a uniform list, rewrites every media URL through the
   proxy, and returns it as JSON.
2. The client downloads the init segment and the media segments via
   `GET /dash/proxy?url=...` (a `Range` request for SegmentBase, a whole-file
   request for SegmentTemplate). The allowlisted proxy streams the bytes back.
3. The client appends them to a single `MediaSource` (one video and one audio
   `SourceBuffer`). To switch quality it calls `changeType()` and appends the
   higher representation's init segment, so the decoder reconfigures on the fly.

## Project structure

```
client/                 browser app, bundled by Vite
  index.html
  src/
    main.js             bootstrap
    player.js           DashPlayer class (orchestrator)
    sidx.js             sidx (segment index) binary parser
    manifest.js         load + classify representations
    segment-loader.js   segment fetch (byte-range or whole file)
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
**Google Chrome** is recommended. The default stream is **Big Buck Bunny**,
served from the public Akamai DASH test CDN.

Play a different DASH source (using either the `SegmentBase` or `SegmentTemplate`
model) by adding its host to `ALLOWED_HOSTS` in
[`server/config.js`](server/config.js), then visiting `/?src=<manifest-url>`.

## Tests

```bash
npm test           # Vitest
```

Covers the server (manifest normalization for both addressing models, init-range
synthesis, allowlist) and the pure client logic (the `sidx` parser and the
scheduler). The MSE player itself runs only in a browser.

## A note on history

Dash Player began as an experiment that streamed **YouTube** videos by reading
their DASH manifest. YouTube has since removed that mechanism (`get_video_info`
and the single `dashmpd` URL are gone, replaced by ciphered signatures), so the
project was refactored into a **general-purpose DASH player** that plays any
standard DASH stream. The browser client was later rewritten from a
jQuery/prototype script into vanilla ES modules with a Vite build, and gained
`SegmentTemplate` support so it can play bright, multi-quality streams like Big
Buck Bunny.

## Credits

Originally created by **Rodrigo Urbina**. Released under the [MIT License](LICENSE).
