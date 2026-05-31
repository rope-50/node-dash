# 🎬 Node Dash

> A from-scratch **MPEG-DASH** video player: a custom [Media Source Extensions](https://developer.mozilla.org/docs/Web/API/Media_Source_Extensions_API) client built on top of a small Node/Express server that fetches, normalizes, and proxies adaptive streams.

[![Node](https://img.shields.io/badge/node-%E2%89%A518-43853d?logo=node.js&logoColor=white)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Node Dash plays adaptive (DASH) video the way a browser-based player has to:
it reads the **MPD manifest**, downloads the **initialization segment** and the
**`sidx` index**, then pulls each media segment by **HTTP byte-range** and feeds
it into a `MediaSource` / `SourceBuffer`. It recreates the YouTube-style
experience (a loading bar, buffering pauses, and adaptive-quality labels) with
no playback library.

## How it works

The browser client and the Node server cooperate over two endpoints:

1. The client requests `GET /dash/manifest?src=<mpd>`. The server fetches and
   parses the MPD (xml2js), normalizes it, rewrites media URLs through the
   proxy, and returns the representation list as JSON.
2. The client downloads the init segment, the `sidx` index, and then each media
   segment via `GET /dash/proxy?url=…` with a `Range: bytes=…` header. The
   allowlisted, range-aware proxy streams back `206 Partial Content`.
3. The client appends those byte ranges to a `MediaSource` / `SourceBuffer` for
   playback.

The pieces:

- **`src/dash.js`** fetches the MPD, flattens its representations to compact
  JSON, resolves relative `BaseURL`s, and **synthesizes the initialization
  byte-range** when the manifest omits it (implicit in the on-demand profile).
- **`server.js`** serves the player page and exposes `/dash/manifest` plus a
  **range-aware media proxy** that is restricted to an allowlist of hosts, so it
  cannot be abused as an open relay.
- **`public/js/dash-client.js`** is the custom MSE player: it parses the `sidx`
  box, schedules byte-range segment downloads, manages the source buffers, and
  drives the playback UI.

## Getting started

```bash
npm install
npm start          # http://localhost:3000
```

Open the page in a browser that supports the stream's codecs (H.264 / AAC).
**Google Chrome** is recommended. The default stream is a public
[DASH-IF](https://dashif.org) test vector.

Point it at a different DASH source (must use the on-demand `SegmentBase` +
`sidx` model) by adding the host to `ALLOWED_HOSTS` in
[`src/config.js`](src/config.js) and visiting `/?src=<manifest-url>`.

## Tests

```bash
npm test           # Vitest: manifest normalization, init-range synthesis, allowlist
```

The server-side logic (manifest parsing, proxy URL rewriting, allowlist) is unit
tested. The MSE player itself runs only in a browser.

## A note on history

Node Dash began as an experiment that streamed **YouTube** videos by reading
their DASH manifest. YouTube has since removed that mechanism (`get_video_info`
and the single `dashmpd` URL are gone, replaced by ciphered signatures), so the
project was refactored into a **general-purpose DASH player**: the original
Media Source Extensions engine is intact, but it now plays any standard
on-demand DASH stream instead of scraping YouTube.

## Credits

Originally created by **Rodrigo Urbina**. Released under the [MIT License](LICENSE).
