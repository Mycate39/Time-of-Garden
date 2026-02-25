import { ipcMain, app, dialog } from 'electron'
import { readFile } from 'fs/promises'
import { basename } from 'path'
import Store from 'electron-store'
import { login, getSavedProfile, logout } from './auth'
import { launchGame } from './launcher'
import { checkForUpdates, downloadMods, saveLocalManifest } from './modUpdater'
import { searchMods, getModDownload, getSuggestedMods } from './modrinth'
import { searchCurseForgeMods, getCurseForgeDownload } from './curseforge'
import { downloadBuffer, uploadModToGitHub, listModsOnGitHub, deleteModFromGitHub } from './githubUploader'

const store = new Store()

const MODS_MANIFEST_URL = 'https://raw.githubusercontent.com/Mycate39/Time-of-Garden/main/mods.json'

const DEFAULT_SETTINGS = {
  ramMin: 2,
  ramMax: 4,
  serverIp: '',
  javaPath: 'java'
}

// Helpers pour la map projectId → filename
function getInstalledMap() { return store.get('installedMods', {}) }
function setInstalledMap(map) { store.set('installedMods', map) }

export function registerIpcHandlers(win) {
  // --- Fenêtre ---
  ipcMain.on('window:minimize', () => win.minimize())
  ipcMain.on('window:close', () => app.quit())

  // --- Authentification ---
  ipcMain.handle('auth:login', async () => {
    const profile = await login()
    return profile
  })

  ipcMain.handle('auth:profile', async () => {
    return getSavedProfile()
  })

  ipcMain.handle('auth:logout', () => {
    logout()
  })

  // --- Paramètres ---
  ipcMain.handle('settings:get', () => {
    return store.get('settings', DEFAULT_SETTINGS)
  })

  ipcMain.handle('settings:set', (_, settings) => {
    store.set('settings', settings)
  })

  // --- Mods ---
  ipcMain.handle('mods:check', async () => {
    const result = await checkForUpdates(MODS_MANIFEST_URL)
    return {
      hasUpdate: result.hasUpdate,
      version: result.remoteManifest?.version ?? null,
      count: result.remoteManifest?.mods?.length ?? 0,
      error: result.error,
      remoteManifest: result.remoteManifest
    }
  })

  ipcMain.handle('mods:apply', async (_, remoteManifest) => {
    await downloadMods(remoteManifest, (progress) => {
      win.webContents.send('mods:progress', progress)
    })
    saveLocalManifest(remoteManifest)
  })

  // --- Bibliothèque admin ---
  ipcMain.handle('admin:search-mods', async (_, { query, source }) => {
    if (source === 'curseforge') return searchCurseForgeMods(query)
    return searchMods(query)
  })

  ipcMain.handle('admin:get-suggestions', async (_, source) => {
    if (source === 'curseforge') return []
    return getSuggestedMods()
  })

  ipcMain.handle('admin:get-installed-map', () => {
    return getInstalledMap()
  })

  ipcMain.handle('admin:list-mods', async () => {
    return listModsOnGitHub()
  })

  ipcMain.handle('admin:delete-mod', async (_, filename) => {
    await deleteModFromGitHub(filename)
    // Retire de la map locale
    const map = getInstalledMap()
    const newMap = Object.fromEntries(Object.entries(map).filter(([, fn]) => fn !== filename))
    setInstalledMap(newMap)
  })

  ipcMain.handle('admin:add-mod', async (_, { projectId, source }) => {
    const installedSet = new Set(Object.keys(getInstalledMap()))
    const depsInstalled = []

    async function installOne(id) {
      if (installedSet.has(id)) return null
      installedSet.add(id)

      const download = source === 'curseforge'
        ? await getCurseForgeDownload(id)
        : await getModDownload(id)
      if (!download) return null

      // Installe les dépendances en premier (récursivement)
      for (const depId of (download.dependencies ?? [])) {
        const depFilename = await installOne(depId)
        if (depFilename) depsInstalled.push(depFilename)
      }

      win.webContents.send('admin:add-progress', { step: 'download', filename: download.filename })
      const buffer = await downloadBuffer(download.url)
      win.webContents.send('admin:add-progress', { step: 'upload', filename: download.filename })
      await uploadModToGitHub(download.filename, buffer)
      setInstalledMap({ ...getInstalledMap(), [id]: download.filename })
      return download.filename
    }

    const filename = await installOne(projectId)
    if (!filename) throw new Error(
      source === 'curseforge'
        ? 'Aucune version compatible ou mod bloqué (distribution interdite)'
        : 'Aucune version compatible Forge 1.20.1 trouvée'
    )
    return { filename, deps: depsInstalled }
  })

  ipcMain.handle('admin:import-local-mod', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Importer des mods',
      filters: [{ name: 'Mods Minecraft', extensions: ['jar'] }],
      properties: ['openFile', 'multiSelections']
    })
    if (canceled || filePaths.length === 0) return []
    const results = []
    for (const filePath of filePaths) {
      const filename = basename(filePath)
      win.webContents.send('admin:import-progress', { filename, step: 'upload' })
      const buffer = await readFile(filePath)
      await uploadModToGitHub(filename, buffer)
      setInstalledMap({ ...getInstalledMap(), [`local:${filename}`]: filename })
      results.push(filename)
    }
    return results
  })

  // --- Lancement du jeu ---
  ipcMain.handle('game:launch', async () => {
    await launchGame({
      onProgress: (e) => win.webContents.send('game:progress', e),
      onLog: (msg) => win.webContents.send('game:log', String(msg)),
      onClose: (code) => win.webContents.send('game:close', code)
    })
  })
}
