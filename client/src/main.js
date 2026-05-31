import './styles.css';
import { DashPlayer } from './player.js';

const status = document.getElementById('status');
const mount = document.getElementById('player');

async function start() {
  try {
    // Allow overriding the stream via ?src=<mpd-url> (validated server-side
    // against the allowlist); otherwise the server uses its default.
    const src = new URLSearchParams(location.search).get('src');
    const manifestUrl = src
      ? `/dash/manifest?src=${encodeURIComponent(src)}`
      : '/dash/manifest';
    await new DashPlayer({ container: mount, manifestUrl }).init();
    status.textContent =
      'Ready: press play to start (MPEG-DASH via Media Source Extensions).';
  } catch (err) {
    console.error(err);
    status.textContent = `Could not load the stream: ${err.message}`;
  }
}

start();
