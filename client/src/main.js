import './styles.css';
import { DashPlayer } from './player.js';

const status = document.getElementById('status');
const mount = document.getElementById('player');

// Fills the explainer with the real timeline (switch + buffering moments), or
// removes a step when it does not apply to the loaded stream.
function describeTimeline(player) {
  const switchStep = document.getElementById('step-switch');
  const bufferStep = document.getElementById('step-buffer');

  if (player.switchTime != null) {
    const low = player.plan.lowRep.$.height;
    const high = player.plan.highRep.$.height;
    switchStep.innerHTML =
      `At about <strong>second ${Math.round(player.switchTime)}</strong> it switches ` +
      `from <strong>${low}p</strong> to <strong>${high}p</strong> on the fly, so the ` +
      `picture visibly gets sharper. Watch the badge (top-right).`;
  } else {
    switchStep.remove();
  }

  if (player.bufferingTime != null) {
    bufferStep.innerHTML =
      `At about <strong>second ${Math.round(player.bufferingTime)}</strong> it pauses ` +
      `briefly to simulate buffering, with a loading bar across the top.`;
  } else {
    bufferStep.remove();
  }
}

async function start() {
  try {
    // Allow overriding the stream via ?src=<mpd-url> (validated server-side
    // against the allowlist); otherwise the server uses its default.
    const src = new URLSearchParams(location.search).get('src');
    const manifestUrl = src
      ? `/dash/manifest?src=${encodeURIComponent(src)}`
      : '/dash/manifest';
    const player = await new DashPlayer({ container: mount, manifestUrl }).init();
    describeTimeline(player);
    status.textContent =
      'Ready: press play to start (MPEG-DASH via Media Source Extensions).';
  } catch (err) {
    console.error(err);
    status.textContent = `Could not load the stream: ${err.message}`;
  }
}

start();
