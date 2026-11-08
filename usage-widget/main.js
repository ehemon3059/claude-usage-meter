const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const { fetchUsagePage, LOGIN_URL, PARTITION } = require('./scraper');

let loginWin = null;

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
  loginWin.loadURL(LOGIN_URL);
}

app.whenReady().then(async () => {
  const result = await fetchUsagePage();
  console.log('status:', result.status);
  if (result.status === 'login') return openLoginWindow();
  if (result.status === 'ok') {
    const out = path.join(__dirname, 'tests', 'fixtures', 'usage-page.txt');
    fs.writeFileSync(out, result.text);
    console.log('captured', result.text.length, 'chars ->', out);
  }
  app.quit();
});

app.on('window-all-closed', () => {});

module.exports = { openLoginWindow };
