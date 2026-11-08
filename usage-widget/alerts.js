// Pure notification rules: fire each threshold once per reset cycle.
const RESET_DROP = 20; // percentage-point drop that counts as a usage reset

function evaluateAlerts(prev, next, armed, label) {
  if (!next) return { messages: [], armed };
  const messages = [];
  let state = { ...armed };
  if (prev && prev.percent - next.percent >= RESET_DROP) {
    messages.push(`${label} reset`);
    state = { t80: true, t95: true };
  }
  if (state.t80 && next.percent >= 80) {
    messages.push(`${label} at 80% used`);
    state.t80 = false;
  }
  if (state.t95 && next.percent >= 95) {
    messages.push(`${label} at 95% used`);
    state.t95 = false;
  }
  return { messages, armed: state };
}

module.exports = { evaluateAlerts };
