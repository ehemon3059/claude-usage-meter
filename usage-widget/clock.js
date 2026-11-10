// Bangladesh-time analog clock: time math + inline-SVG rendering.
// UMD: module.exports in Node (tests), window.Clock in the app window.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Clock = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const BD_OFFSET_MS = 6 * 3600 * 1000; // Bangladesh Standard Time, UTC+6, no daylight saving
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const pad = (n) => String(n).padStart(2, '0');

  function bangladeshParts(utcMs) {
    const d = new Date(utcMs + BD_OFFSET_MS);
    return {
      year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), weekday: d.getUTCDay(),
      hours: d.getUTCHours(), minutes: d.getUTCMinutes(), seconds: d.getUTCSeconds(),
    };
  }

  /** Degrees clockwise from 12 o'clock. Hour/minute hands creep; the second hand ticks. */
  function handAngles(utcMs) {
    const p = bangladeshParts(utcMs);
    return {
      hour: (p.hours % 12) * 30 + p.minutes / 2 + p.seconds / 120,
      minute: p.minutes * 6 + p.seconds / 10,
      second: p.seconds * 6,
    };
  }

  function formatTime(utcMs) {
    const p = bangladeshParts(utcMs);
    return `${pad(p.hours % 12 || 12)}:${pad(p.minutes)}:${pad(p.seconds)} ${p.hours < 12 ? 'AM' : 'PM'}`;
  }

  function formatDate(utcMs) {
    const p = bangladeshParts(utcMs);
    return `${DAYS[p.weekday]}, ${p.day} ${MONTHS[p.month - 1]} ${p.year}`;
  }

  /** "3 min ago" style age of a timestamp, or null if there is none. */
  function formatAgo(thenMs, nowMs) {
    if (!thenMs) return null;
    const s = Math.max(0, (nowMs - thenMs) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
    return `${Math.floor(s / 86400)} d ago`;
  }

  // ---- SVG (browser only); same 200x200 user space as the gauges ----
  // The face sits a little high so the date line and caption under it line up with the
  // gauges' reset line and caption (resetY / captionY in gauges.js).
  const CLOCK_CONFIG = { cx: 100, cy: 88, radius: 70, dateY: 185, captionY: 202, viewHeight: 210 };
  const NS = 'http://www.w3.org/2000/svg';
  const { cx: CX, cy: CY, radius: FACE_R } = CLOCK_CONFIG;

  function pt(angle, r) {
    const a = (angle * Math.PI) / 180;
    return [CX + r * Math.sin(a), CY - r * Math.cos(a)];
  }
  function el(tag, attrs, parent, text) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text !== undefined) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  const hand = (svg, cls, tail, length) => el('line', { x1: CX, y1: CY + tail, x2: CX, y2: CY - length, class: `hand ${cls}` }, svg);

  function buildClock(svg) {
    svg.setAttribute('viewBox', `0 0 200 ${CLOCK_CONFIG.viewHeight}`);
    el('circle', { cx: CX, cy: CY, r: FACE_R, class: 'clock-face' }, svg);
    for (let i = 0; i < 60; i++) {
      const major = i % 5 === 0;
      const [x1, y1] = pt(i * 6, FACE_R - (major ? 9 : 5));
      const [x2, y2] = pt(i * 6, FACE_R - 2);
      el('line', { x1, y1, x2, y2, class: major ? 'tick tick-major' : 'tick' }, svg);
    }
    for (let h = 1; h <= 12; h++) {
      const [x, y] = pt(h * 30, FACE_R - 18);
      el('text', { x, y, class: 'clock-num', 'text-anchor': 'middle', 'dominant-baseline': 'central' }, svg, h);
    }
    el('text', { x: CX, y: CY - 24, class: 'clock-zone', 'text-anchor': 'middle' }, svg, 'DHAKA');
    svg._date = el('text', { x: CX, y: CLOCK_CONFIG.dateY, class: 'clock-date', 'text-anchor': 'middle' }, svg, '');
    svg._caption = el('text', { x: CX, y: CLOCK_CONFIG.captionY, class: 'caption', 'text-anchor': 'middle' }, svg, '');
    svg._hands = {
      hour: hand(svg, 'hand-hour', 7, 35),
      minute: hand(svg, 'hand-minute', 9, 52),
      second: hand(svg, 'hand-second', 13, 59),
    };
    el('circle', { cx: CX, cy: CY, r: 4, class: 'hub' }, svg);
  }

  /** synced=false means the internet time servers were unreachable and the PC clock is shown. */
  function renderClock(svg, utcMs, synced) {
    if (!svg._hands) buildClock(svg);
    const a = handAngles(utcMs);
    for (const k in svg._hands) svg._hands[k].setAttribute('transform', `rotate(${a[k]} ${CX} ${CY})`);
    svg._date.textContent = formatDate(utcMs);
    svg._caption.textContent = synced ? 'BANGLADESH TIME' : 'BD TIME · PC CLOCK';
  }

  return { BD_OFFSET_MS, CLOCK_CONFIG, bangladeshParts, handAngles, formatTime, formatDate, formatAgo, renderClock };
});
