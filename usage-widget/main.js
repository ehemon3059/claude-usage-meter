const { app, BrowserWindow, ipcMain, screen, Tray, Menu, Notification, nativeImage, shell, net, powerMonitor } = require('electron');
const fs = require('fs');
const path = require('path');
const Store = require('electron-store');
const { getUsage, LOGIN_URL, PARTITION } = require('./scraper');
const { mergeUsage, restoreBounds, refreshWaitMs, authorLink } = require('./state');
const { evaluateAlerts } = require('./alerts');
const { syncTime, queryNtp, queryHttpDate } = require('./timesync');

const POLL_MS = 180000; // 3 min
const MIN_POLL_MS = 120000; // never scrape more often than 2 min
const FORCE_GAP_MS = 30000; // forced scrapes (startup, login, Refresh button) keep at least this gap
const WINDOW_OPTS = { width: 760, height: 380, minWidth: 560, minHeight: 280 };
const TIME_SYNC_MS = 30 * 60 * 1000;
const TIME_RETRY_MS = 2 * 60 * 1000;
const TIME_SOURCES = [
  { name: 'time.google.com', query: () => queryNtp('time.google.com') },
  { name: 'pool.ntp.org', query: () => queryNtp('pool.ntp.org') },
  { name: 'time.windows.com', query: () => queryNtp('time.windows.com') },
  // For networks that block NTP (UDP 123).
  { name: 'google.com', query: () => queryHttpDate(net.fetch, 'https://www.google.com/') },
];

const store = new Store();
let mainWin = null;
let loginWin = null;
let quitting = false;
let inFlight = null;
let lastScrapeAt = 0;
let uiState = { session: null, week: null, stale: false, message: null, updatedAt: null };
let timeState = { offset: 0, source: null, syncedAt: null };
let timeTimer = null;

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

function send(channel, payload) {
  if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send(channel, payload);
}

function pushState() {
  send('usage:update', uiState);
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

function showWindow() {
  if (!mainWin) return;
  if (mainWin.isMinimized()) mainWin.restore();
  mainWin.show();
  mainWin.focus();
}

function toggleWindow() {
  if (!mainWin) return;
  if (mainWin.isVisible() && !mainWin.isMinimized()) mainWin.hide();
  else showWindow();
}

/** Refresh button / tray item: scrape now unless one ran in the last 30s. */
async function manualRefresh() {
  if (inFlight) {
    await inFlight;
    return { ok: true };
  }
  const waitMs = refreshWaitMs(lastScrapeAt, Date.now(), FORCE_GAP_MS);
  if (waitMs > 0) return { ok: false, waitMs };
  await refresh({ force: true });
  return { ok: true };
}

async function trayRefresh() {
  const r = await manualRefresh();
  if (!r.ok) notify(`Refreshed recently. Try again in ${Math.ceil(r.waitMs / 1000)}s.`);
}

function updateTray() {
  if (!tray) return;
  tray.setToolTip(tooltipText());
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Refresh now', click: trayRefresh },
    { label: 'Show/Hide', click: toggleWindow },
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
  tray.on('click', showWindow);
  updateTray();
}

/** Single-flight scrape. Non-forced calls inside the 2-minute floor return the cached state. */
function refresh({ force = false } = {}) {
  if (inFlight) return inFlight;
  // Forced scrapes (startup, post-login, Refresh button) keep a 30s gap; normal ones keep the 2-minute floor.
  if (refreshWaitMs(lastScrapeAt, Date.now(), force ? FORCE_GAP_MS : MIN_POLL_MS) > 0) return Promise.resolve();
  inFlight = (async () => {
    send('usage:busy', true);
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
      send('usage:busy', false);
    }
  })();
  return inFlight;
}

// ---- Internet time for the clock ----
let timeSync = null;

/** Keeps the last good offset if a sync fails; source stays null only until the first success. */
function syncClock() {
  if (timeSync) return timeSync;
  clearTimeout(timeTimer);
  timeSync = (async () => {
    const r = await syncTime(TIME_SOURCES);
    if (r) timeState = { offset: r.offset, source: r.source, syncedAt: Date.now() };
    send('time:update', timeState);
    timeTimer = setTimeout(syncClock, r ? TIME_SYNC_MS : TIME_RETRY_MS);
  })().finally(() => { timeSync = null; });
  return timeSync;
}

// Primary display first (restoreBounds falls back to workAreas[0]).
function workAreas() {
  const primary = screen.getPrimaryDisplay();
  const others = screen.getAllDisplays().filter((d) => d.id !== primary.id);
  return [primary.workArea, ...others.map((d) => d.workArea)];
}

function createMainWindow() {
  const bounds = restoreBounds(store.get('windowBounds'), workAreas(), WINDOW_OPTS);
  mainWin = new BrowserWindow({
    ...bounds,
    minWidth: WINDOW_OPTS.minWidth,
    minHeight: WINDOW_OPTS.minHeight,
    title: 'Claude Usage Meter',
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    backgroundColor: '#0a0d12',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWin.removeMenu();
  mainWin.once('ready-to-show', () => {
    if (store.get('windowMaximized')) mainWin.maximize(); // also shows it
    else mainWin.show();
  });

  const saveBounds = () => {
    if (mainWin.isMinimized()) return;
    store.set('windowBounds', mainWin.getNormalBounds());
    store.set('windowMaximized', mainWin.isMaximized());
  };
  for (const ev of ['resized', 'moved', 'maximize', 'unmaximize']) mainWin.on(ev, saveBounds);

  // X hides to the tray so polling and alerts keep running; Quit is in the tray menu.
  const allowClose = () => { quitting = true; };
  mainWin.on('query-session-end', allowClose); // Windows shutdown / sign-out must not be blocked
  mainWin.on('session-end', allowClose);
  mainWin.on('close', (e) => {
    if (quitting) return;
    e.preventDefault();
    mainWin.hide();
    if (!store.get('trayHintShown')) {
      notify('Still running in the tray. Right-click the tray icon and choose Quit to exit.');
      store.set('trayHintShown', true);
    }
  });

  // The page never navigates; author links go through link:open to the default browser.
  mainWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWin.webContents.on('will-navigate', (e) => e.preventDefault());
  mainWin.loadFile(path.join(__dirname, 'widget.html'));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWindow);
  app.on('before-quit', () => { quitting = true; });

  ipcMain.handle('usage:get', () => ({ ...uiState, busy: !!inFlight }));
  ipcMain.handle('usage:refresh', () => manualRefresh());
  ipcMain.handle('time:get', () => timeState);
  ipcMain.handle('link:open', (_e, key) => {
    const url = authorLink(key);
    if (url) shell.openExternal(url);
  });

  app.whenReady().then(() => {
    const stored = store.get('lastUsage');
    if (stored) uiState = { session: stored.session || null, week: stored.week || null, stale: false, message: null, updatedAt: stored.updatedAt || null };
    createMainWindow();
    createTray();
    refresh({ force: true });
    setInterval(() => refresh(), POLL_MS);
    syncClock();
    powerMonitor.on('resume', syncClock);
  });

  app.on('window-all-closed', () => {});
}

module.exports = { openLoginWindow, refresh, createMainWindow };
