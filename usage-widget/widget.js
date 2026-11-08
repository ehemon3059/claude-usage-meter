const speedo = document.getElementById('speedo');
const fuel = document.getElementById('fuel');
const staleEl = document.getElementById('stale');

function renderState(state) {
  Gauges.renderSpeedometer(speedo, state.session);
  Gauges.renderFuel(fuel, state.week);
  staleEl.hidden = !state.stale;
  staleEl.textContent = state.message ? `Stale - ${state.message}` : 'Stale';
}

if (new URLSearchParams(location.search).has('dev')) {
  // Dev harness: open widget.html?dev to drive the gauges with sliders.
  const dev = document.getElementById('dev');
  dev.hidden = false;
  const s = document.getElementById('dev-session');
  const w = document.getElementById('dev-week');
  const update = () => renderState({
    session: { percent: +s.value, resets: 'Resets 4:50 PM' },
    week: { percent: +w.value, resets: 'Resets Thu 5:00 PM' },
    stale: false,
  });
  s.oninput = w.oninput = update;
  update();
} else if (window.usageApi) {
  window.usageApi.getUsage().then(renderState);
  window.usageApi.onUsage(renderState);
}
