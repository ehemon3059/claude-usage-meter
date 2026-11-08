const { app, BrowserWindow, ipcMain, screen } = require('electron');
const fs = require('fs');
const path = require('path');
const Store = require('electron-store');
const { getUsage, LOGIN_URL, PARTITION } = require('./scraper');
const { mergeUsage, clampBounds } = require('./state');

const POLL_MS = 180000; // 3 min
const MIN_POLL_MS = 120000; // never scrape more often than 2 min
const WIDGET_SIZE = { width: 440, height: 260 };

const store = new Store();
let widgetWin = null;
let loginWin = null;
let inFlight = null;
let lastScrapeAt = 0;
let uiState = { session: null, week: null, stale: false, message: null, updatedAt: null };

function openLoginWindow() {
  if (loginWin && !loginWin.isDestroyed()) {
    loginWin.show();
    loginWin.focus();
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
    if (u.hostname.endsWith('claude.ai') && !u.pathname.startsWith('/login')) {
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
}

/** Single-flight scrape. Non-forced calls inside the 2-minute floor return the cached state. */
function refresh({ force = false } = {}) {
  if (inFlight) return inFlight;
  if (!force && Date.now() - lastScrapeAt < MIN_POLL_MS) return Promise.resolve();
  inFlight = (async () => {
    try {
      lastScrapeAt = Date.now();
      const result = await getUsage();
      const stored = store.get('lastUsage');
      const merged = mergeUsage(stored, result);
      if (result.status === 'ok') store.set('lastUsage', { session: merged.session, week: merged.week });
      uiState = { ...merged, updatedAt: result.status === 'ok' ? Date.now() : (stored && stored.updatedAt) || null };
      if (result.status === 'ok') store.set('lastUsage.updatedAt', uiState.updatedAt);
      if (result.status === 'login' || result.status === 'blocked') openLoginWindow();
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
    refresh({ force: true });
    setInterval(() => refresh(), POLL_MS);
  });

  app.on('window-all-closed', () => {});
}

module.exports = { openLoginWindow, refresh, createWidgetWindow };
