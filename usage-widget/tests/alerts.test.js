const test = require('node:test');
const assert = require('node:assert');
const { evaluateAlerts } = require('../alerts');

const ARMED = { t80: true, t95: true };
const p = (percent) => ({ percent, resets: '' });

test('crossing 80 fires once and disarms t80', () => {
  const r = evaluateAlerts(p(79), p(80), ARMED, 'Session');
  assert.deepStrictEqual(r.messages, ['Session at 80% used']);
  assert.deepStrictEqual(r.armed, { t80: false, t95: true });
});

test('staying above 80 on the next poll fires nothing', () => {
  const first = evaluateAlerts(p(79), p(85), ARMED, 'Session');
  const second = evaluateAlerts(p(85), p(86), first.armed, 'Session');
  assert.deepStrictEqual(second.messages, []);
});

test('crossing 95 fires the 95 message', () => {
  const r = evaluateAlerts(p(94), p(95), { t80: false, t95: true }, 'Session');
  assert.deepStrictEqual(r.messages, ['Session at 95% used']);
  assert.strictEqual(r.armed.t95, false);
});

test('jumping from 70 to 96 with both armed fires both once', () => {
  const r = evaluateAlerts(p(70), p(96), ARMED, 'Week');
  assert.deepStrictEqual(r.messages, ['Week at 80% used', 'Week at 95% used']);
  assert.deepStrictEqual(r.armed, { t80: false, t95: false });
});

test('a drop of 20+ points is a reset: message and re-arm', () => {
  const r = evaluateAlerts(p(90), p(5), { t80: false, t95: false }, 'Session');
  assert.deepStrictEqual(r.messages, ['Session reset']);
  assert.deepStrictEqual(r.armed, ARMED);
});

test('a small decrease is not a reset', () => {
  const r = evaluateAlerts(p(60), p(55), ARMED, 'Session');
  assert.deepStrictEqual(r.messages, []);
});

test('first run (no prev) at 85 fires 80 but not a reset', () => {
  const r = evaluateAlerts(null, p(85), ARMED, 'Session');
  assert.deepStrictEqual(r.messages, ['Session at 80% used']);
});

test('null next section fires nothing and keeps armed state', () => {
  const armed = { t80: false, t95: true };
  assert.deepStrictEqual(evaluateAlerts(p(50), null, armed, 'Session'), { messages: [], armed });
});
