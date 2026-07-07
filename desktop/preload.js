const { contextBridge, ipcRenderer } = require('electron');

// Pont sécurisé entre l'app Electron et l'interface React.
contextBridge.exposeInMainWorld('electron', {
  isDesktop: true,
  getVersion: () => ipcRenderer.invoke('app:version'),
  // Mises à jour : téléchargement piloté par l'interface, puis redémarrage.
  downloadUpdate: () => ipcRenderer.invoke('app:download-update'),
  installUpdate: () => ipcRenderer.invoke('app:install-update'),
  onUpdateAvailable: (cb) => ipcRenderer.on('update:available', (_e, info) => cb(info)),
  onUpdateProgress: (cb) => ipcRenderer.on('update:progress', (_e, p) => cb(p)),
  onUpdateDownloaded: (cb) => ipcRenderer.on('update:downloaded', (_e, info) => cb(info)),
});
