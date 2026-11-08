const speedo = document.getElementById('speedo');
const fuel = document.getElementById('fuel');

function renderState(state) {
  Gauges.renderSpeedometer(speedo, state.session);
  Gauges.renderFuel(fuel, state.week);
}

// Dev harness: open widget.html?dev to drive the gauges with sliders.
if (new URLSearchParams(location.search).has('dev')) {
  const dev = document.getElementById('dev');
  dev.hidden = false;
  const s = document.getElementById('dev-session');
  const w = document.getElementById('dev-week');
  const update = () => renderState({
    session: { percent: +s.value, resets: 'Resets 4:50 PM' },
    week: { percent: +w.value, resets: 'Resets Thu 5:00 PM' },
  });
  s.oninput = w.oninput = update;
  update();
}
