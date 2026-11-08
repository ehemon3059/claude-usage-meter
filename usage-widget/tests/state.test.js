const test = require('node:test');
const assert = require('node:assert');
const { mergeUsage, clampBounds } = require('../state');

const S = { percent: 57, resets: 'Resets 4:50 PM' };
const W = { percent: 32, resets: 'Resets Thu 5:00 PM' };

test('ok result replaces values and clears stale', () => {
  const r = mergeUsage(null, { status: 'ok', session: S, week: W });
  assert.deepStrictEqual(r, { session: S, week: W, stale: false, message: null });
});

test('ok result with missing week keeps previously stored week', () => {
  const r = mergeUsage({ session: { percent: 1, resets: '' }, week: W }, { status: 'ok', session: S, week: null });
  assert.deepStrictEqual(r.week, W);
  assert.deepStrictEqual(r.session, S);
});

test('ok result with missing week and nothing stored leaves week null', () => {
  assert.strictEqual(mergeUsage(null, { status: 'ok', session: S, week: null }).week, null);
});

test('failed refresh keeps stored values, marks stale with a message', () => {
  const stored = { session: S, week: W };
  const cases = { login: 'Please log in', blocked: 'Verification needed', offline: 'Offline', parse_fail: "Couldn't read page" };
  for (const [status, message] of Object.entries(cases)) {
    assert.deepStrictEqual(mergeUsage(stored, { status }), { session: S, week: W, stale: true, message });
  }
});

test('failed refresh with nothing stored gives null sections', () => {
  const r = mergeUsage(null, { status: 'offline' });
  assert.deepStrictEqual([r.session, r.week, r.stale], [null, null, true]);
});

const display = [{ x: 0, y: 0, width: 1920, height: 1040 }];
const size = { width: 440, height: 260 };

test('clampBounds keeps a visible position', () => {
  assert.deepStrictEqual(clampBounds({ x: 100, y: 200 }, display, size), { x: 100, y: 200 });
});

test('clampBounds moves an off-screen position to the primary top-right', () => {
  assert.deepStrictEqual(clampBounds({ x: 3000, y: 100 }, display, size), { x: 1920 - 440 - 20, y: 20 });
});

test('clampBounds with no saved position uses the primary top-right', () => {
  assert.deepStrictEqual(clampBounds(undefined, display, size), { x: 1460, y: 20 });
});
