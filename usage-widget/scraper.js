const { BrowserWindow, session } = require('electron');
const { parseUsage } = require('./parser');

const PARTITION = 'persist:claude';
const LOGIN_URL = 'https://claude.ai/login';
const USAGE_URL = 'https://claude.ai/settings/usage';
const RENDER_WAIT_MS = 3000;
const SETTLE_RETRIES = 12;
const TIMEOUT_MS = 40000;
const OFFLINE_ERRORS = /ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ERR_NETWORK_CHANGED|ERR_CONNECTION_/;

function cleanUserAgent() {
  const ses = session.fromPartition(PARTITION);
  const ua = ses.getUserAgent().replace(/\sElectron\/\S+/, '');
  ses.setUserAgent(ua);
}

/** @returns {Promise<{status:'ok'|'login'|'blocked'|'offline', text?:string}>} */
function fetchUsagePage() {
  cleanUserAgent();
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      show: false,
      webPreferences: { partition: PARTITION, contextIsolation: true, nodeIntegration: false },
    });
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (!win.isDestroyed()) win.destroy();
      resolve(result);
    };
    const timer = setTimeout(() => finish({ status: 'offline' }), TIMEOUT_MS);

    win.webContents.on('did-fail-load', (_e, _code, desc, _url, isMainFrame) => {
      if (isMainFrame && OFFLINE_ERRORS.test(desc)) finish({ status: 'offline' });
    });
    // After the first load, wait RENDER_WAIT_MS, then keep checking (the SPA may
    // still show "Loading..." or redirect to /login late) until the page settles.
    const check = async (attempt) => {
      if (done || win.isDestroyed()) return;
      try {
        const url = win.webContents.getURL();
        const title = win.webContents.getTitle();
        const text = await win.webContents.executeJavaScript('document.body.innerText');
        if (/\/(login|logout)\b/.test(url)) return finish({ status: 'login' });
        if (/just a moment|verify you are human/i.test(title + '\n' + text)) {
          return finish({ status: 'blocked' });
        }
        const settled = /current session|this week|\d+\s*%\s*used/i.test(text);
        if (settled || attempt >= SETTLE_RETRIES) return finish({ status: 'ok', text });
        setTimeout(() => check(attempt + 1), 1000);
      } catch {
        finish({ status: 'offline' });
      }
    };
    win.webContents.once('did-finish-load', () => setTimeout(() => check(0), RENDER_WAIT_MS));
    win.loadURL(USAGE_URL).catch(() => {});
  });
}

/** @returns {Promise<{status:'ok',session,week}|{status:'login'|'blocked'|'offline'}|{status:'parse_fail',rawText:string}>} */
async function getUsage() {
  const page = await fetchUsagePage();
  if (page.status !== 'ok') return { status: page.status };
  const { session: s, week } = parseUsage(page.text);
  if (!s && !week) return { status: 'parse_fail', rawText: page.text };
  return { status: 'ok', session: s, week };
}

module.exports = { fetchUsagePage, getUsage, LOGIN_URL, USAGE_URL, PARTITION };
