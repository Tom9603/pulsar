const { app, BrowserWindow, ipcMain, shell, session, systemPreferences } = require('electron');
const path = require('node:path');
const electronUpdater = require('electron-updater');

const autoUpdater = electronUpdater.autoUpdater;
const isDev = !app.isPackaged;

let mainWindow = null;

// Autorise le micro (et la caméra) demandés par l'interface web à l'intérieur de l'app.
function setupMediaPermissions() {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    const allowed = ['media', 'microphone', 'camera', 'audioCapture', 'videoCapture'];
    callback(allowed.includes(permission));
  });
  // Sur macOS, déclenche la demande d'autorisation système au démarrage.
  if (process.platform === 'darwin') {
    systemPreferences.askForMediaAccess('microphone').catch(() => {});
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 940,
    minHeight: 560,
    backgroundColor: '#14161c',
    autoHideMenuBar: true,
    title: 'Pulsar',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    // En développement : on charge le serveur Vite.
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    // En production : on charge le client compilé.
    mainWindow.loadFile(path.join(__dirname, '..', 'client', 'dist', 'index.html'));
  }

  // Les liens externes s'ouvrent dans le navigateur, pas dans l'app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  setupMediaPermissions();
  createWindow();

  // Mises à jour automatiques (uniquement en version installée).
  if (!isDev) {
    autoUpdater.checkForUpdatesAndNotify().catch(() => {});
    autoUpdater.on('update-downloaded', () => {
      mainWindow?.webContents.send('update-downloaded');
    });
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Le client peut demander la version de l'app et déclencher l'installation d'une maj.
ipcMain.handle('app:version', () => app.getVersion());
ipcMain.handle('app:install-update', () => autoUpdater.quitAndInstall());
