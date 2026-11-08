// Parses document.body.innerText of the claude.ai usage page. Text-based, never CSS classes.
const HEADINGS = { session: /current session/i, week: /this week/i };

function sectionText(text, key) {
  const m = HEADINGS[key].exec(text);
  if (!m) return null;
  const rest = text.slice(m.index + m[0].length);
  // Section ends where the other heading begins.
  const other = HEADINGS[key === 'session' ? 'week' : 'session'].exec(rest);
  return other ? rest.slice(0, other.index) : rest;
}

function parseSection(block) {
  if (!block) return null;
  const pct = /(\d{1,3})\s*%\s*used/i.exec(block);
  if (!pct) return null;
  const resets = /resets[^\n]*/i.exec(block);
  return {
    percent: Math.min(100, Math.max(0, parseInt(pct[1], 10))),
    resets: resets ? resets[0].trim() : '',
  };
}

function parseUsage(text) {
  const src = String(text || '');
  return {
    session: parseSection(sectionText(src, 'session')),
    week: parseSection(sectionText(src, 'week')),
  };
}

module.exports = { parseUsage };
