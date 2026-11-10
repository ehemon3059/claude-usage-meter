// Dev-only: opens widget.html?dev in a plain window. Run: npm run dev:gauges
const { app, BrowserWindow } = require('electron');
const path = require('path');
app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 760, height: 440, backgroundColor: '#222' });
  win.loadFile(path.join(__dirname, '..', 'widget.html'), { query: { dev: '1' } });
});
app.on('window-all-closed', () => app.quit());
