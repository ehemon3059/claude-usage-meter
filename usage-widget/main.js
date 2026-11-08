const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const { fetchUsagePage, getUsage, LOGIN_URL, PARTITION } = require('./scraper');

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
  const result = await getUsage();
  console.log(JSON.stringify(result, null, 2));
  if (result.status === 'login') return openLoginWindow();
  if (result.status === 'parse_fail') {
    fs.writeFileSync(path.join(__dirname, 'tests', 'fixtures', 'usage-page.txt'), result.rawText);
    console.log('raw text saved to tests/fixtures/usage-page.txt');
  }
  app.quit();
});

app.on('window-all-closed', () => {});

module.exports = { openLoginWindow };
