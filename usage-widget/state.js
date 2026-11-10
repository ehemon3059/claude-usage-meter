// Pure helpers for main.js: merging scrape results into UI state, window bounds, refresh gating, links.
const MESSAGES = {
  login: 'Please log in',
  blocked: 'Verification needed',
  offline: 'Offline',
  parse_fail: "Couldn't read page",
};

/** @returns {{session:object|null, week:object|null, stale:boolean, message:string|null}} */
function mergeUsage(stored, result) {
  const prev = stored || {};
  if (result.status === 'ok') {
    return {
      session: result.session || prev.session || null,
      week: result.week || prev.week || null,
      stale: false,
      message: null,
    };
  }
  return {
    session: prev.session || null,
    week: prev.week || null,
    stale: true,
    message: MESSAGES[result.status] || 'Error',
  };
}

function intersects(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/**
 * Window bounds to open with. A saved window that touches a display is fitted fully onto that
 * display (size clamped to [minimum, display], position pulled inside); otherwise the window is
 * centered on the primary (first) display.
 */
function restoreBounds(saved, workAreas, { width, height, minWidth, minHeight }) {
  const s = saved || {};
  const want = {
    width: Number.isFinite(s.width) ? s.width : width,
    height: Number.isFinite(s.height) ? s.height : height,
  };
  const hasPos = Number.isFinite(s.x) && Number.isFinite(s.y);
  const home = hasPos && workAreas.find((wa) => intersects({ x: s.x, y: s.y, ...want }, wa));
  const wa = home || workAreas[0];
  const size = {
    width: clamp(want.width, minWidth, wa.width),
    height: clamp(want.height, minHeight, wa.height),
  };
  if (home) {
    return {
      x: clamp(s.x, wa.x, wa.x + wa.width - size.width),
      y: clamp(s.y, wa.y, wa.y + wa.height - size.height),
      ...size,
    };
  }
  return {
    x: wa.x + Math.round((wa.width - size.width) / 2),
    y: wa.y + Math.round((wa.height - size.height) / 2),
    ...size,
  };
}

/** Milliseconds until another scrape is allowed (0 = now). lastScrapeAt 0 means never scraped. */
function refreshWaitMs(lastScrapeAt, now, gapMs) {
  if (!lastScrapeAt) return 0;
  return Math.max(0, gapMs - (now - lastScrapeAt));
}

// The page asks for a link by key; only these URLs can ever be opened.
const AUTHOR_LINKS = {
  github: 'https://github.com/ehemon3059/claude-usage-meter',
  facebook: 'https://www.facebook.com/eh.emon3059/',
};
const authorLink = (key) => (Object.hasOwn(AUTHOR_LINKS, key) ? AUTHOR_LINKS[key] : null);

module.exports = { mergeUsage, restoreBounds, refreshWaitMs, authorLink, MESSAGES };
