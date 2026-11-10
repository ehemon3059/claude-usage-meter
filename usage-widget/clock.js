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
  const NS = 'http://www.w3.org/2000/svg';
  const C = 100;
  const FACE_R = 76;

  function pt(angle, r) {
    const a = (angle * Math.PI) / 180;
    return [C + r * Math.sin(a), C - r * Math.cos(a)];
  }
  function el(tag, attrs, parent, text) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text !== undefined) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  const hand = (svg, cls, tail, length) => el('line', { x1: C, y1: C + tail, x2: C, y2: C - length, class: `hand ${cls}` }, svg);

  function buildClock(svg) {
    svg.setAttribute('viewBox', '0 0 200 200');
    el('circle', { cx: C, cy: C, r: FACE_R, class: 'clock-face' }, svg);
    for (let i = 0; i < 60; i++) {
      const major = i % 5 === 0;
      const [x1, y1] = pt(i * 6, FACE_R - (major ? 9 : 5));
      const [x2, y2] = pt(i * 6, FACE_R - 2);
      el('line', { x1, y1, x2, y2, class: major ? 'tick tick-major' : 'tick' }, svg);
    }
    for (let h = 1; h <= 12; h++) {
      const [x, y] = pt(h * 30, FACE_R - 19);
      el('text', { x, y, class: 'clock-num', 'text-anchor': 'middle', 'dominant-baseline': 'central' }, svg, h);
    }
    el('text', { x: C, y: C - 24, class: 'clock-zone', 'text-anchor': 'middle' }, svg, 'DHAKA');
    svg._digital = el('text', { x: C, y: C + 30, class: 'clock-digital', 'text-anchor': 'middle' }, svg, '');
    svg._date = el('text', { x: C, y: C + 42, class: 'clock-date', 'text-anchor': 'middle' }, svg, '');
    svg._caption = el('text', { x: C, y: 192, class: 'caption', 'text-anchor': 'middle' }, svg, '');
    svg._hands = {
      hour: hand(svg, 'hand-hour', 8, 38),
      minute: hand(svg, 'hand-minute', 10, 56),
      second: hand(svg, 'hand-second', 14, 64),
    };
    el('circle', { cx: C, cy: C, r: 4, class: 'hub' }, svg);
  }

  /** synced=false means the internet time servers were unreachable and the PC clock is shown. */
  function renderClock(svg, utcMs, synced) {
    if (!svg._hands) buildClock(svg);
    const a = handAngles(utcMs);
    for (const k in svg._hands) svg._hands[k].setAttribute('transform', `rotate(${a[k]} ${C} ${C})`);
    svg._digital.textContent = formatTime(utcMs);
    svg._date.textContent = formatDate(utcMs);
    svg._caption.textContent = synced ? 'BANGLADESH TIME' : 'BD TIME · PC CLOCK';
  }

  return { BD_OFFSET_MS, bangladeshParts, handAngles, formatTime, formatDate, formatAgo, renderClock };
});
