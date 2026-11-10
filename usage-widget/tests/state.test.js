const test = require('node:test');
const assert = require('node:assert');
const { mergeUsage, restoreBounds, refreshWaitMs, authorLink } = require('../state');

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
const opts = { width: 760, height: 380, minWidth: 560, minHeight: 280 };

test('restoreBounds keeps a saved, visible window as it was', () => {
  const saved = { x: 100, y: 200, width: 900, height: 500 };
  assert.deepStrictEqual(restoreBounds(saved, display, opts), saved);
});

test('restoreBounds gives an old widget position ({x,y} only) the default size', () => {
  assert.deepStrictEqual(restoreBounds({ x: 100, y: 200 }, display, opts), { x: 100, y: 200, width: 760, height: 380 });
});

test('restoreBounds clamps the saved size between the minimum and the screen', () => {
  assert.deepStrictEqual(restoreBounds({ x: 0, y: 0, width: 100, height: 50 }, display, opts), { x: 0, y: 0, width: 560, height: 280 });
  assert.deepStrictEqual(restoreBounds({ x: 0, y: 0, width: 5000, height: 3000 }, display, opts), { x: 0, y: 0, width: 1920, height: 1040 });
});

test('restoreBounds pulls a partly off-screen window fully onto its display', () => {
  // The old 440px widget sat near the right edge; the 760px window must not hang off it.
  assert.deepStrictEqual(restoreBounds({ x: 1485, y: 392 }, display, opts), { x: 1920 - 760, y: 392, width: 760, height: 380 });
  assert.deepStrictEqual(restoreBounds({ x: -50, y: 900, width: 760, height: 380 }, display, opts), { x: 0, y: 1040 - 380, width: 760, height: 380 });
});

test('restoreBounds keeps a window on a second display and fits it there', () => {
  const two = [display[0], { x: 1920, y: 0, width: 1280, height: 1000 }];
  assert.deepStrictEqual(restoreBounds({ x: 2900, y: 100, width: 900, height: 500 }, two, opts), { x: 1920 + 1280 - 900, y: 100, width: 900, height: 500 });
});

test('restoreBounds centers the window on the primary display when off-screen or unsaved', () => {
  const centered = { x: (1920 - 760) / 2, y: (1040 - 380) / 2, width: 760, height: 380 };
  assert.deepStrictEqual(restoreBounds({ x: 3000, y: 100 }, display, opts), centered);
  assert.deepStrictEqual(restoreBounds(undefined, display, opts), centered);
});

test('refreshWaitMs is 0 before the first scrape and once the gap has passed', () => {
  assert.strictEqual(refreshWaitMs(0, 50000, 30000), 0);
  assert.strictEqual(refreshWaitMs(10000, 50000, 30000), 0);
});

test('refreshWaitMs reports the time left inside the gap', () => {
  assert.strictEqual(refreshWaitMs(40000, 50000, 30000), 20000);
});

test('authorLink returns only the two allowed author URLs', () => {
  assert.strictEqual(authorLink('github'), 'https://github.com/ehemon3059/claude-usage-meter');
  assert.strictEqual(authorLink('facebook'), 'https://www.facebook.com/eh.emon3059/');
  assert.strictEqual(authorLink('https://evil.example'), null);
  assert.strictEqual(authorLink('toString'), null);
});
