// The only bridge between the app window and the main process.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('usageApi', {
  onUsage: (cb) => ipcRenderer.on('usage:update', (_e, state) => cb(state)),
  getUsage: () => ipcRenderer.invoke('usage:get'),
  onBusy: (cb) => ipcRenderer.on('usage:busy', (_e, busy) => cb(busy)),
  refresh: () => ipcRenderer.invoke('usage:refresh'),
  onTime: (cb) => ipcRenderer.on('time:update', (_e, t) => cb(t)),
  getTime: () => ipcRenderer.invoke('time:get'),
  openLink: (key) => ipcRenderer.invoke('link:open', key), // 'github' | 'facebook'
});
