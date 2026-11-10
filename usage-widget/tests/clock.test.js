const test = require('node:test');
const assert = require('node:assert');
const C = require('../clock');

// Bangladesh is UTC+6 all year (no daylight saving).
const bd = (y, mo, d, h, mi, s) => Date.UTC(y, mo - 1, d, h - 6, mi, s);

test('bangladeshParts shifts UTC by +6h and rolls the date over', () => {
  const p = C.bangladeshParts(Date.UTC(2026, 10, 10, 18, 30, 15)); // 18:30 UTC = 00:30 next day in Dhaka
  assert.deepStrictEqual(
    [p.year, p.month, p.day, p.hours, p.minutes, p.seconds],
    [2026, 11, 11, 0, 30, 15]
  );
});

test('handAngles at 3:00:00 points the hour hand at 90 degrees', () => {
  assert.deepStrictEqual(C.handAngles(bd(2026, 11, 10, 3, 0, 0)), { hour: 90, minute: 0, second: 0 });
});

test('handAngles moves hour and minute hands smoothly between marks', () => {
  // 9:30:45 -> hour 270 + 15 + 0.375, minute 180 + 4.5, second 270
  assert.deepStrictEqual(C.handAngles(bd(2026, 11, 10, 9, 30, 45)), { hour: 285.375, minute: 184.5, second: 270 });
});

test('handAngles uses a 12-hour dial in the afternoon', () => {
  assert.strictEqual(C.handAngles(bd(2026, 11, 10, 15, 0, 0)).hour, 90);
});

test('formatTime gives 12-hour time with AM/PM', () => {
  assert.strictEqual(C.formatTime(bd(2026, 11, 10, 0, 5, 9)), '12:05:09 AM');
  assert.strictEqual(C.formatTime(bd(2026, 11, 10, 12, 0, 0)), '12:00:00 PM');
  assert.strictEqual(C.formatTime(bd(2026, 11, 10, 13, 45, 0)), '01:45:00 PM');
});

test('formatDate shows the Bangladesh calendar date', () => {
  assert.strictEqual(C.formatDate(Date.UTC(2026, 10, 10, 18, 30, 0)), 'Wed, 11 Nov 2026');
});

test('formatAgo describes how long ago usage was updated', () => {
  const now = Date.UTC(2026, 10, 10, 12, 0, 0);
  assert.strictEqual(C.formatAgo(null, now), null);
  assert.strictEqual(C.formatAgo(now - 20 * 1000, now), 'just now');
  assert.strictEqual(C.formatAgo(now - 3 * 60 * 1000, now), '3 min ago');
  assert.strictEqual(C.formatAgo(now - 5 * 3600 * 1000, now), '5 h ago');
  assert.strictEqual(C.formatAgo(now - 2 * 86400 * 1000, now), '2 d ago');
});
