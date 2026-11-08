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
