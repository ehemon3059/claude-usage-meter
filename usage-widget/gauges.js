// Gauge math + inline-SVG rendering. UMD: module.exports in Node (tests), window.Gauges in the widget.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Gauges = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // All gauge sizes live here (SVG user units; the CSS scales the <svg> to the window).
  const GAUGE_CONFIG = {
    // resetY / captionY: baselines of the "Resets ..." line and the caption under it, below the dial.
    // viewHeight: the view is taller than it is wide to leave room for that text.
    speedo: { size: 200, viewHeight: 210, radius: 78, start: -135, end: 135, needleLength: 62, resetY: 185, captionY: 202 },
    fuel: { size: 200, viewHeight: 210, radius: 78, start: -90, end: 90, needleLength: 62, resetY: 185, captionY: 202 },
    zones: {
      speedo: [
        { from: 0, to: 70, color: 'green' },
        { from: 70, to: 90, color: 'yellow' },
        { from: 90, to: 100, color: 'red' },
      ],
      // Fuel arc is drawn in "remaining" percent: red below 10, green above.
      fuel: [
        { from: 0, to: 10, color: 'red' },
        { from: 10, to: 100, color: 'green' },
      ],
    },
    lowFuelBelow: 10,
  };

  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

  function percentToAngle(percent, startAngle, endAngle) {
    return startAngle + (clamp(percent, 0, 100) / 100) * (endAngle - startAngle);
  }

  function speedoZone(used) {
    if (used >= 90) return 'red';
    if (used >= 70) return 'yellow';
    return 'green';
  }

  const fuelRemaining = (used) => clamp(100 - used, 0, 100);
  const isLowFuel = (used) => fuelRemaining(used) < GAUGE_CONFIG.lowFuelBelow;

  // ---- SVG helpers (browser only) ----
  const NS = 'http://www.w3.org/2000/svg';
  const C = 100; // center x/y in user units

  function pt(angle, r) {
    const a = (angle * Math.PI) / 180; // 0 = 12 o'clock, clockwise
    return [C + r * Math.sin(a), C - r * Math.cos(a)];
  }
  function el(tag, attrs, parent, text) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text !== undefined) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  function arcPath(a1, a2, r) {
    const [x1, y1] = pt(a1, r);
    const [x2, y2] = pt(a2, r);
    return `M${x1.toFixed(2)} ${y1.toFixed(2)} A${r} ${r} 0 ${a2 - a1 > 180 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  }
  function drawZones(svg, cfg, zones) {
    for (const z of zones) {
      el('path', {
        d: arcPath(percentToAngle(z.from, cfg.start, cfg.end), percentToAngle(z.to, cfg.start, cfg.end), cfg.radius),
        class: `arc arc-${z.color}`,
        fill: 'none',
      }, svg);
    }
  }
  function drawNeedle(svg, cfg) {
    const g = el('g', { class: 'needle' }, svg);
    el('line', { x1: C, y1: C, x2: C, y2: C - cfg.needleLength, class: 'needle-line' }, g);
    el('circle', { cx: C, cy: C, r: 5, class: 'hub' }, svg);
    return g;
  }
  const setNeedle = (g, angle) => { g.style.transform = `rotate(${angle}deg)`; };

  function buildSpeedo(svg) {
    const cfg = GAUGE_CONFIG.speedo;
    svg.setAttribute('viewBox', `0 0 ${cfg.size} ${cfg.viewHeight}`);
    drawZones(svg, cfg, GAUGE_CONFIG.zones.speedo);
    for (let v = 0; v <= 100; v += 10) {
      const a = percentToAngle(v, cfg.start, cfg.end);
      const major = v % 20 === 0;
      const [x1, y1] = pt(a, cfg.radius - (major ? 10 : 6));
      const [x2, y2] = pt(a, cfg.radius - 2);
      el('line', { x1, y1, x2, y2, class: major ? 'tick tick-major' : 'tick' }, svg);
      if (major) {
        const [tx, ty] = pt(a, cfg.radius - 19);
        el('text', { x: tx, y: ty, class: 'tick-label', 'text-anchor': 'middle', 'dominant-baseline': 'middle' }, svg, v);
      }
    }
    el('text', { x: C, y: C + 38, class: 'readout', 'text-anchor': 'middle' }, svg, '--');
    el('text', { x: C, y: cfg.captionY, class: 'caption', 'text-anchor': 'middle' }, svg, 'CURRENT SESSION');
    el('text', { x: C, y: cfg.resetY, class: 'reset', 'text-anchor': 'middle' }, svg, '');
    svg._needle = drawNeedle(svg, cfg);
    setNeedle(svg._needle, cfg.start);
  }

  function buildFuel(svg) {
    const cfg = GAUGE_CONFIG.fuel;
    svg.setAttribute('viewBox', `0 0 ${cfg.size} ${cfg.viewHeight}`);
    drawZones(svg, cfg, GAUGE_CONFIG.zones.fuel);
    for (let v = 0; v <= 100; v += 25) {
      const a = percentToAngle(v, cfg.start, cfg.end);
      const [x1, y1] = pt(a, cfg.radius - 8);
      const [x2, y2] = pt(a, cfg.radius - 2);
      el('line', { x1, y1, x2, y2, class: 'tick tick-major' }, svg);
    }
    const [ex, ey] = pt(cfg.start, cfg.radius - 20);
    const [fx, fy] = pt(cfg.end, cfg.radius - 20);
    el('text', { x: ex + 4, y: ey + 4, class: 'tick-label e-label', 'text-anchor': 'middle' }, svg, 'E');
    el('text', { x: fx - 4, y: fy + 4, class: 'tick-label', 'text-anchor': 'middle' }, svg, 'F');
    // small fuel-pump icon above the hub
    el('path', {
      class: 'pump',
      d: 'M92 62h12v18H92z M104 66h4l3 3v9a2 2 0 0 0 4 0V68l-3-3',
      fill: 'none',
    }, svg);
    el('text', { x: C, y: C + 28, class: 'readout small', 'text-anchor': 'middle' }, svg, '--');
    el('text', { x: C, y: cfg.resetY, class: 'reset', 'text-anchor': 'middle' }, svg, '');
    el('text', { x: C, y: cfg.captionY, class: 'caption', 'text-anchor': 'middle' }, svg, 'THIS WEEK');
    svg._needle = drawNeedle(svg, cfg);
    setNeedle(svg._needle, cfg.start);
  }

  const same = (a, b) => a && b && a.percent === b.percent && a.resets === b.resets;

  function renderSpeedometer(svg, data) {
    if (!svg._needle) buildSpeedo(svg);
    const d = data && data.percent != null ? data : null;
    if (same(d, svg._last) || (!d && svg._last === null)) return; // re-render only on change
    svg._last = d;
    const cfg = GAUGE_CONFIG.speedo;
    const readout = svg.querySelector('.readout');
    readout.textContent = d ? `${d.percent}%` : '--';
    readout.setAttribute('class', `readout zone-${d ? speedoZone(d.percent) : 'green'}`);
    svg.querySelector('.reset').textContent = d ? d.resets : '';
    setNeedle(svg._needle, d ? percentToAngle(d.percent, cfg.start, cfg.end) : cfg.start);
  }

  function renderFuel(svg, data) {
    if (!svg._needle) buildFuel(svg);
    const d = data && data.percent != null ? data : null;
    if (same(d, svg._last) || (!d && svg._last === null)) return;
    svg._last = d;
    const cfg = GAUGE_CONFIG.fuel;
    svg.querySelector('.readout').textContent = d ? `${d.percent}% used` : '--';
    svg.querySelector('.reset').textContent = d ? d.resets : '';
    // Needle shows REMAINING quota: empty (E) at the left.
    setNeedle(svg._needle, d ? percentToAngle(fuelRemaining(d.percent), cfg.start, cfg.end) : cfg.start);
    svg.classList.toggle('low-fuel', !!d && isLowFuel(d.percent));
  }

  return {
    GAUGE_CONFIG, percentToAngle, speedoZone, fuelRemaining, isLowFuel,
    renderSpeedometer, renderFuel,
  };
});
