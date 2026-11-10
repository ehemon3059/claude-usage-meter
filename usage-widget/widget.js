const speedo = document.getElementById('speedo');
const fuel = document.getElementById('fuel');
const clockSvg = document.getElementById('clock');
const clockTip = document.getElementById('clock-tip');
const statusEl = document.getElementById('status');
const refreshBtn = document.getElementById('refresh');
const api = window.usageApi;

let usage = { session: null, week: null, stale: false, message: null, updatedAt: null };
let time = { offset: 0, source: null, syncedAt: null }; // offset: internet time minus PC clock
let busy = false;
let notice = null; // short-lived status text, e.g. "try again in 12s"
let noticeTimer = null;

function renderStatus() {
  let text;
  let warn = false;
  const ago = Clock.formatAgo(usage.updatedAt, Date.now()); // updatedAt is PC-clock ms from main
  if (notice) text = notice;
  else if (busy) text = 'Refreshing…';
  else if (usage.stale) {
    warn = true;
    text = (usage.message || 'Stale') + (ago ? ` · last update ${ago}` : '');
  } else text = ago ? `Updated ${ago}` : 'Waiting for first update…';
  statusEl.textContent = text;
  statusEl.classList.toggle('warn', warn);
}

function renderUsage(state) {
  usage = state;
  Gauges.renderSpeedometer(speedo, state.session);
  Gauges.renderFuel(fuel, state.week);
  renderStatus();
}

function setBusy(b) {
  busy = b;
  refreshBtn.classList.toggle('busy', b);
  refreshBtn.disabled = b;
  renderStatus();
}

function showNotice(text) {
  notice = text;
  renderStatus();
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { notice = null; renderStatus(); }, 4000);
}

function setTime(t) {
  time = t;
  clockTip.textContent = t.source
    ? `Bangladesh time (UTC+6), synced with ${t.source} at ${Clock.formatTime(t.syncedAt + t.offset)}`
    : "Couldn't reach internet time servers. Showing your PC clock converted to Bangladesh time.";
}

// Redraw just after each second boundary of the internet-corrected time.
function tick() {
  const now = Date.now() + time.offset;
  Clock.renderClock(clockSvg, now, !!time.source);
  renderStatus(); // keeps "Updated N min ago" current
  setTimeout(tick, 1000 - (now % 1000) + 10);
}

setTime(time);
tick();

if (new URLSearchParams(location.search).has('dev')) {
  // Dev harness: open widget.html?dev to drive the gauges with sliders.
  const dev = document.getElementById('dev');
  dev.hidden = false;
  const s = document.getElementById('dev-session');
  const w = document.getElementById('dev-week');
  const update = () => renderUsage({
    session: { percent: +s.value, resets: 'Resets 4:50 PM' },
    week: { percent: +w.value, resets: 'Resets Thu 5:00 PM' },
    stale: false,
    updatedAt: Date.now(),
  });
  s.oninput = w.oninput = update;
  update();
} else if (api) {
  api.getUsage().then((s) => { renderUsage(s); if (s.busy) setBusy(true); });
  api.onUsage(renderUsage);
  api.onBusy(setBusy);
  api.getTime().then(setTime);
  api.onTime(setTime);

  refreshBtn.addEventListener('click', async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await api.refresh();
      if (!r.ok) showNotice(`Refreshed recently. Try again in ${Math.ceil(r.waitMs / 1000)}s`);
    } finally {
      setBusy(false);
    }
  });
  document.querySelectorAll('[data-link]').forEach((b) => {
    b.addEventListener('click', () => api.openLink(b.dataset.link));
  });
}
