import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'
import { autoUpdater } from 'electron-updater'
import Store from 'electron-store'
import { registerIpcHandlers } from './ipc'

const store = new Store()
let mainWindow

autoUpdater.autoDownload = false        // L'utilisateur décide de télécharger
autoUpdater.autoInstallOnAppQuit = true

function createWindow() {
  const savedPos = store.get('win.position')

  mainWindow = new BrowserWindow({
    width: 960,
    height: 700,
    minWidth: 960,
    minHeight: 700,
    ...(savedPos ? { x: savedPos.x, y: savedPos.y } : {}),
    resizable: false,
    frame: false,
    backgroundColor: '#0d0d1a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('moved', () => {
    const [x, y] = mainWindow.getPosition()
    store.set('win.position', { x, y })
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

    autoUpdater.on('error', (err) => {
      win.webContents.send('updater:error', err?.message ?? 'Erreur inconnue')
    })

    // Déclenché par le renderer quand l'utilisateur clique "Télécharger"
    ipcMain.on('updater:download', () => {
      autoUpdater.downloadUpdate()
    })

    ipcMain.on('updater:install', () => {
      autoUpdater.quitAndInstall()
    })

    ipcMain.on('updater:open-releases', () => {
      shell.openExternal('https://github.com/Mycate39/Time-of-Garden/releases/latest')
    })
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  app.quit()
})
