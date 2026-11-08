// Pure helpers for main.js: merging scrape results into UI state and keeping the window on-screen.
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

/** Keep saved {x,y} if the window would be visible on some display, else primary (first) top-right. */
function clampBounds(saved, workAreas, size) {
  if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
    const rect = { x: saved.x, y: saved.y, width: size.width, height: size.height };
    if (workAreas.some((wa) => intersects(rect, wa))) return { x: saved.x, y: saved.y };
  }
  const wa = workAreas[0];
  return { x: wa.x + wa.width - size.width - 20, y: wa.y + 20 };
}

module.exports = { mergeUsage, clampBounds, MESSAGES };
