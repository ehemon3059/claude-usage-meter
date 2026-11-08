// The only bridge between the widget page and the main process.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('usageApi', {
  onUsage: (cb) => ipcRenderer.on('usage:update', (_e, state) => cb(state)),
  getUsage: () => ipcRenderer.invoke('usage:get'),
});
