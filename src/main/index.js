import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { autoUpdater } from 'electron-updater'
import { registerIpcHandlers } from './ipc'

let mainWindow

autoUpdater.autoDownload = true
autoUpdater.autoInstallOnAppQuit = true

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 700,
    minWidth: 960,
    minHeight: 700,
    resizable: false,
    frame: false,
    backgroundColor: '#0d0d1a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

app.whenReady().then(() => {
  const win = createWindow()
  registerIpcHandlers(win)

  // Vérifie les mises à jour (seulement en prod)
  if (app.isPackaged) {
    autoUpdater.checkForUpdates()

    autoUpdater.on('update-available', (info) => {
      win.webContents.send('updater:available', { version: info.version })
    })

    autoUpdater.on('download-progress', (progress) => {
      win.webContents.send('updater:progress', Math.round(progress.percent))
    })

    autoUpdater.on('update-downloaded', () => {
      win.webContents.send('updater:ready')
    })

    autoUpdater.on('error', () => {
      // Erreur silencieuse — pas critique
    })

    ipcMain.on('updater:install', () => {
      autoUpdater.quitAndInstall()
    })
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  app.quit()
})
