const test = require('node:test');
const assert = require('node:assert');
const G = require('../gauges');

test('percentToAngle maps ends and midpoint for the speedometer', () => {
  assert.strictEqual(G.percentToAngle(0, -135, 135), -135);
  assert.strictEqual(G.percentToAngle(100, -135, 135), 135);
  assert.strictEqual(G.percentToAngle(50, -135, 135), 0);
});

test('percentToAngle clamps out-of-range percent', () => {
  assert.strictEqual(G.percentToAngle(150, -135, 135), 135);
  assert.strictEqual(G.percentToAngle(-5, -135, 135), -135);
});

test('percentToAngle works for the fuel half-circle', () => {
  assert.strictEqual(G.percentToAngle(100, -90, 90), 90);
  assert.strictEqual(G.percentToAngle(0, -90, 90), -90);
});

test('speedoZone boundaries: 69 green, 70/89 yellow, 90/100 red', () => {
  assert.strictEqual(G.speedoZone(69), 'green');
  assert.strictEqual(G.speedoZone(70), 'yellow');
  assert.strictEqual(G.speedoZone(89), 'yellow');
  assert.strictEqual(G.speedoZone(90), 'red');
  assert.strictEqual(G.speedoZone(100), 'red');
  assert.strictEqual(G.speedoZone(0), 'green');
});

test('fuelRemaining is 100 minus used, clamped', () => {
  assert.strictEqual(G.fuelRemaining(32), 68);
  assert.strictEqual(G.fuelRemaining(100), 0);
  assert.strictEqual(G.fuelRemaining(0), 100);
  assert.strictEqual(G.fuelRemaining(120), 0);
});

test('isLowFuel is true only below 10% remaining', () => {
  assert.strictEqual(G.isLowFuel(91), true);
  assert.strictEqual(G.isLowFuel(90), false);
  assert.strictEqual(G.isLowFuel(100), true);
});

test('text under each dial: reset line one line above the caption, with room below the dial', () => {
  for (const key of ['speedo', 'fuel']) {
    const cfg = G.GAUGE_CONFIG[key];
    // Lowest point of the arc (its ends), plus half the 6-unit stroke.
    const arcBottom = 100 + cfg.radius * Math.max(0, -Math.cos((cfg.start * Math.PI) / 180)) + 3;
    const gap = cfg.captionY - cfg.resetY;
    assert.ok(gap >= 12 && gap <= 20, `${key}: reset ${cfg.resetY} should be one line above caption ${cfg.captionY}`);
    // 13px reset text rises about 10 units above its baseline.
    const space = cfg.resetY - 10 - arcBottom;
    assert.ok(space >= 15, `${key}: only ${space.toFixed(1)} units between dial and text`);
    assert.ok(cfg.captionY + 5 <= cfg.viewHeight, `${key}: caption ${cfg.captionY} runs past the view (${cfg.viewHeight})`);
  }
});
