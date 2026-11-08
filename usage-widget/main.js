const { app, BrowserWindow, ipcMain, screen, Tray, Menu, Notification, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const Store = require('electron-store');
const { getUsage, LOGIN_URL, PARTITION } = require('./scraper');
const { mergeUsage, clampBounds } = require('./state');
const { evaluateAlerts } = require('./alerts');

const POLL_MS = 180000; // 3 min
const MIN_POLL_MS = 120000; // never scrape more often than 2 min
const FORCE_GAP_MS = 30000;
const WIDGET_SIZE = { width: 440, height: 260 };

const store = new Store();
let widgetWin = null;
let loginWin = null;
let inFlight = null;
let lastScrapeAt = 0;
let uiState = { session: null, week: null, stale: false, message: null, updatedAt: null };

function openLoginWindow({ focus = true } = {}) {
  if (loginWin && !loginWin.isDestroyed()) {
    if (focus) { loginWin.show(); loginWin.focus(); }
    return;
  }
  loginWin = new BrowserWindow({
    width: 480,
    height: 720,
    webPreferences: { partition: PARTITION, contextIsolation: true, nodeIntegration: false },
  });
  loginWin.on('closed', () => { loginWin = null; });
  // Once the user is past the login pages, scrape right away and close the window on success.
  loginWin.webContents.on('did-navigate', async (_e, url) => {
    let u;
    try { u = new URL(url); } catch { return; }
    if (u.hostname.endsWith('claude.ai') && !/^\/(login|logout)/.test(u.pathname)) {
      await refresh({ force: true });
      if (uiState.message === null && loginWin && !loginWin.isDestroyed()) loginWin.close();
    }
  });
  loginWin.loadURL(LOGIN_URL);
}

function logParseFailure(rawText) {
  const file = path.join(app.getPath('userData'), 'parse-failures.log');
  fs.appendFileSync(file, `\n===== ${new Date().toISOString()} =====\n${rawText}\n`);
}

function pushState() {
  if (widgetWin && !widgetWin.isDestroyed()) widgetWin.webContents.send('usage:update', uiState);
  updateTray();
}

function notify(body) {
  if (Notification.isSupported()) new Notification({ title: 'Claude usage', body }).show();
}

function runAlerts(prevState, nextState) {
  for (const [key, label] of [['session', 'Session'], ['week', 'Week']]) {
    const armed = store.get(`armed.${key}`, { t80: true, t95: true });
    const r = evaluateAlerts(prevState[key], nextState[key], armed, label);
    store.set(`armed.${key}`, r.armed);
    r.messages.forEach(notify);
  }
}

// ---- Tray ----
let tray = null;

// 16x16 orange ring drawn in code (BGRA), so no image asset is needed.
function trayIcon() {
  const size = 16;
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      if (d <= 7 && d >= 4.5) buf.set([0x3d, 0x6b, 0xff, 0xff], (y * size + x) * 4);
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size });
}

function tooltipText() {
  if (uiState.message === 'Please log in') return 'Please log in';
  const pct = (s) => (s ? `${s.percent}%` : '--');
  return `Session ${pct(uiState.session)} | Week ${pct(uiState.week)}`;
}

function toggleWidget() {
  if (!widgetWin) return;
  if (widgetWin.isVisible()) widgetWin.hide();
  else widgetWin.show();
}

function refreshNow() {
  const wait = MIN_POLL_MS - (Date.now() - lastScrapeAt);
  if (wait > 0 && !inFlight) notify(`Refreshed recently. Next refresh possible in ${Math.ceil(wait / 1000)}s.`);
  return refresh();
}

function updateTray() {
  if (!tray) return;
  tray.setToolTip(tooltipText());
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Refresh now', click: refreshNow },
    { label: 'Show/Hide', click: toggleWidget },
    { label: 'Re-login', click: () => openLoginWindow() },
    {
      label: 'Start with Windows',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }),
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]));
}

function createTray() {
  tray = new Tray(trayIcon());
  tray.on('click', toggleWidget);
  updateTray();
}

/** Single-flight scrape. Non-forced calls inside the 2-minute floor return the cached state. */
function refresh({ force = false } = {}) {
  if (inFlight) return inFlight;
  const since = Date.now() - lastScrapeAt;
  // Forced scrapes (startup, post-login) still keep a 30s gap; normal ones keep the 2-minute floor.
  if (since < (force ? FORCE_GAP_MS : MIN_POLL_MS) && lastScrapeAt) return Promise.resolve();
  inFlight = (async () => {
    try {
      lastScrapeAt = Date.now();
      const result = await getUsage();
      const stored = store.get('lastUsage');
      const prevState = uiState;
      const merged = mergeUsage(stored, result);
      if (result.status === 'ok') store.set('lastUsage', { session: merged.session, week: merged.week });
      uiState = { ...merged, updatedAt: result.status === 'ok' ? Date.now() : (stored && stored.updatedAt) || null };
      if (result.status === 'ok') store.set('lastUsage.updatedAt', uiState.updatedAt);
      if (result.status === 'ok') runAlerts(prevState, uiState);
      if (result.status === 'login' || result.status === 'blocked') openLoginWindow({ focus: false });
      if (result.status === 'parse_fail') logParseFailure(result.rawText);
      pushState();
    } catch (err) {
      console.error('refresh failed', err);
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

// Primary display first (clampBounds falls back to workAreas[0]).
function workAreas() {
  const primary = screen.getPrimaryDisplay();
  const others = screen.getAllDisplays().filter((d) => d.id !== primary.id);
  return [primary.workArea, ...others.map((d) => d.workArea)];
}

function createWidgetWindow() {
  const pos = clampBounds(
    store.get('windowBounds'),
    workAreas(),
    WIDGET_SIZE
  );
  widgetWin = new BrowserWindow({
    ...WIDGET_SIZE,
    ...pos,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  widgetWin.on('moved', () => {
    const [x, y] = widgetWin.getPosition();
    store.set('windowBounds', { x, y });
  });
  widgetWin.loadFile(path.join(__dirname, 'widget.html'));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (widgetWin) { widgetWin.show(); widgetWin.focus(); }
  });

  ipcMain.handle('usage:get', () => uiState);

  app.whenReady().then(() => {
    const stored = store.get('lastUsage');
    if (stored) uiState = { session: stored.session || null, week: stored.week || null, stale: false, message: null, updatedAt: stored.updatedAt || null };
    createWidgetWindow();
    createTray();
    refresh({ force: true });
    setInterval(() => refresh(), POLL_MS);
  });

  app.on('window-all-closed', () => {});
}

module.exports = { openLoginWindow, refresh, createWidgetWindow };
