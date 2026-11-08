const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { parseUsage } = require('../parser');

const fixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'usage-page.txt'), 'utf8');

test('parses the captured usage page fixture', () => {
  const r = parseUsage(fixture);
  for (const s of [r.session, r.week]) {
    assert.ok(s, 'section present');
    assert.ok(Number.isInteger(s.percent) && s.percent >= 0 && s.percent <= 100);
    assert.match(s.resets, /^Resets/);
  }
});

test('extracts percent and reset text for both sections', () => {
  const r = parseUsage(
    'Current session\nResets 4:50 PM\n57% used\nWeekly limits\nThis week\nResets Thursday 5:00 PM\n32% used'
  );
  assert.deepStrictEqual(r.session, { percent: 57, resets: 'Resets 4:50 PM' });
  assert.deepStrictEqual(r.week, { percent: 32, resets: 'Resets Thursday 5:00 PM' });
});

test('missing weekly section yields week null, session kept', () => {
  const r = parseUsage('Current session\nResets 4:50 PM\n57% used');
  assert.strictEqual(r.week, null);
  assert.strictEqual(r.session.percent, 57);
});

test('relative reset wording is passed through verbatim', () => {
  const r = parseUsage('Current session\nResets in 2 hr 15 min\n10% used');
  assert.strictEqual(r.session.resets, 'Resets in 2 hr 15 min');
});

test('boundary values 0% and 100% parse', () => {
  assert.strictEqual(parseUsage('Current session\nResets 1:00 PM\n0% used').session.percent, 0);
  assert.strictEqual(parseUsage('Current session\nResets 1:00 PM\n100% used').session.percent, 100);
});

test('garbage text yields both null', () => {
  assert.deepStrictEqual(parseUsage('hello world'), { session: null, week: null });
});
