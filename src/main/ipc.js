import { ipcMain, app, dialog } from 'electron'
import { readFile } from 'fs/promises'
import { basename } from 'path'
import Store from 'electron-store'
import { login, getSavedProfile, logout, listAccounts, switchAccount } from './auth'
import { launchGame } from './launcher'
import { checkForUpdates, downloadMods, saveLocalManifest } from './modUpdater'
import { searchMods, getModDownload, getSuggestedMods, getVersionByHash, getModInfo } from './modrinth'
import { searchCurseForgeMods, getCurseForgeDownload, getSuggestedCurseForgeMods } from './curseforge'
import { createHash } from 'crypto'
import { downloadBuffer, uploadModToGitHub, listModsOnGitHub, deleteModFromGitHub, pushModsManifest } from './githubUploader'

const store = new Store()

const MODS_MANIFEST_URL = 'https://raw.githubusercontent.com/Mycate39/Time-of-Garden/main/mods.json'
const GITHUB_REPO = 'Mycate39/Time-of-Garden'

const DEFAULT_SETTINGS = {
  ram: 4,
  autoUpdateMods: false,
  javaPath: 'java',
  githubToken: ''
}

function getInstalledMap() { return store.get('installedMods', {}) }
function setInstalledMap(map) { store.set('installedMods', map) }
function getInstalledMeta() { return store.get('installedMeta', {}) }
function setInstalledMeta(meta) { store.set('installedMeta', meta) }

// Construit la map inverse filename → projectId
function buildReverseMap() {
  const reverseMap = {}
  for (const [projectId, filename] of Object.entries(getInstalledMap())) {
    if (!projectId.startsWith('local:')) reverseMap[filename] = projectId
  }
  return reverseMap
}


// Regénère et pousse le mods.json après un changement (bumpe la version)
async function refreshManifest() {
  const allMods = await listModsOnGitHub()
  const mods = allMods.map(f => ({
    filename: f.filename,
    url: `https://raw.githubusercontent.com/${GITHUB_REPO}/main/mods/${encodeURIComponent(f.filename)}`
  }))
  const current = store.get('mods.publishedVersion', '1.0.0')
  const parts = current.split('.').map(Number)
  parts[2] = (parts[2] ?? 0) + 1
  const newVersion = parts.join('.')
  store.set('mods.publishedVersion', newVersion)
  const settings = store.get('settings', DEFAULT_SETTINGS)
  await pushModsManifest({ version: newVersion, mods, autoUpdate: settings.autoUpdateMods ?? false })
  return { version: newVersion, mods }
}

// Met à jour uniquement le champ autoUpdate dans mods.json sans changer la version
async function pushAutoUpdateOnly(autoUpdate) {
  const allMods = await listModsOnGitHub()
  const mods = allMods.map(f => ({
    filename: f.filename,
    url: `https://raw.githubusercontent.com/${GITHUB_REPO}/main/mods/${encodeURIComponent(f.filename)}`
  }))
  const currentVersion = store.get('mods.publishedVersion', '1.0.0')
  await pushModsManifest({ version: currentVersion, mods, autoUpdate })
}

export function registerIpcHandlers(win) {
  // --- Fenêtre ---
  ipcMain.on('window:minimize', () => win.minimize())
  ipcMain.on('window:close', () => app.quit())

  // --- Authentification ---
  ipcMain.handle('auth:login', async () => login())
  ipcMain.handle('auth:profile', async () => getSavedProfile())
  ipcMain.handle('auth:logout', () => logout())
  ipcMain.handle('auth:get-accounts', () => listAccounts())
  ipcMain.handle('auth:switch-account', (_, uuid) => switchAccount(uuid))

  // --- Paramètres ---
  // Merge avec DEFAULT_SETTINGS pour garantir que tous les champs existent
  ipcMain.handle('settings:get', () => ({ ...DEFAULT_SETTINGS, ...store.get('settings', {}) }))
  ipcMain.handle('settings:set', (_, settings) => store.set('settings', settings))

  // --- Mods (joueurs) ---
  ipcMain.handle('mods:check', async () => {
    const result = await checkForUpdates(MODS_MANIFEST_URL)
    return {
      hasUpdate: result.hasUpdate,
      version: result.remoteManifest?.version ?? null,
      count: result.remoteManifest?.mods?.length ?? 0,
      autoUpdate: result.remoteManifest?.autoUpdate ?? false,
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

  // --- Vérification des nouvelles versions de mods ---
  ipcMain.handle('admin:check-mod-updates', async () => {
    const updates = []
    const reverseMap = buildReverseMap()
    const githubMods = await listModsOnGitHub()

    for (const { filename } of githubMods) {
      try {
        let projectId = reverseMap[filename]

        if (!projectId) {
          const rawUrl = `https://raw.githubusercontent.com/${GITHUB_REPO}/main/mods/${encodeURIComponent(filename)}`
          const buffer = await downloadBuffer(rawUrl)
          const sha1 = createHash('sha1').update(buffer).digest('hex')
          const found = await getVersionByHash(sha1)
          if (!found?.project_id) continue
          projectId = found.project_id
          setInstalledMap({ ...getInstalledMap(), [projectId]: filename })
        }

        const isCurseForge = /^\d+$/.test(projectId)
        const latest = isCurseForge
          ? await getCurseForgeDownload(projectId)
          : await getModDownload(projectId)

        if (latest && latest.filename !== filename) {
          updates.push({
            projectId,
            source: isCurseForge ? 'curseforge' : 'modrinth',
            currentFilename: filename,
            newFilename: latest.filename,
            newUrl: latest.url
          })
        }
      } catch {}
    }

    return updates
  })

  ipcMain.handle('admin:apply-mod-update', async (_, { projectId, currentFilename, newFilename, newUrl }) => {
    win.webContents.send('admin:mod-update-progress', { projectId, step: 'download' })
    const buffer = await downloadBuffer(newUrl)

    win.webContents.send('admin:mod-update-progress', { projectId, step: 'upload' })
    await uploadModToGitHub(newFilename, buffer)

    if (newFilename !== currentFilename) {
      try { await deleteModFromGitHub(currentFilename) } catch {}
    }

    setInstalledMap({ ...getInstalledMap(), [projectId]: newFilename })

    const { mods } = await refreshManifest()

    return { newFilename }
  })

  // --- Bibliothèque admin ---
  ipcMain.handle('admin:search-mods', async (_, { query }) => {
    const [mrRes, cfRes] = await Promise.allSettled([
      searchMods(query),
      searchCurseForgeMods(query)
    ])
    const mr = mrRes.status === 'fulfilled' ? (mrRes.value ?? []) : []
    const cf = cfRes.status === 'fulfilled' ? (cfRes.value ?? []) : []
    // Modrinth en priorité — dédoublonnage par titre normalisé
    const seen = new Set(mr.map(m => m.title.toLowerCase().trim()))
    const cfFiltered = cf.filter(m => !seen.has(m.title.toLowerCase().trim()))
    return [...mr, ...cfFiltered]
  })

  ipcMain.handle('admin:get-suggestions', async () => {
    const [mrRes, cfRes] = await Promise.allSettled([
      getSuggestedMods(),
      getSuggestedCurseForgeMods()
    ])
    const mr = mrRes.status === 'fulfilled' ? (mrRes.value ?? []) : []
    const cf = cfRes.status === 'fulfilled' ? (cfRes.value ?? []) : []
    const seen = new Set(mr.map(m => m.title.toLowerCase().trim()))
    const cfFiltered = cf.filter(m => !seen.has(m.title.toLowerCase().trim()))
    return [...mr, ...cfFiltered]
  })

  ipcMain.handle('admin:get-installed-map', () => getInstalledMap())

  // Retourne les mods GitHub enrichis avec les métadonnées
  ipcMain.handle('admin:list-mods', async () => {
    const githubMods = await listModsOnGitHub()
    const reverseMap = buildReverseMap()
    const meta = getInstalledMeta()

    return githubMods.map(m => {
      const projectId = reverseMap[m.filename] ?? null
      const modMeta = projectId ? (meta[projectId] ?? null) : null
      return {
        filename: m.filename,
        projectId,
        title: modMeta?.title ?? null,
        description: modMeta?.description ?? null,
        icon_url: modMeta?.icon_url ?? null,
        client_side: modMeta?.client_side ?? null,
        server_side: modMeta?.server_side ?? null
      }
    })
  })

  ipcMain.handle('admin:delete-mod', async (_, filename) => {
    await deleteModFromGitHub(filename)

    const map = getInstalledMap()
    const projectId = Object.entries(map).find(([, fn]) => fn === filename)?.[0]
    const newMap = Object.fromEntries(Object.entries(map).filter(([, fn]) => fn !== filename))
    setInstalledMap(newMap)

    if (projectId) {
      const { [projectId]: _, ...newMeta } = getInstalledMeta()
      setInstalledMeta(newMeta)
    }

    await refreshManifest()
  })

  ipcMain.handle('admin:add-mod', async (_, { projectId, source, meta }) => {
    const settings = store.get('settings', DEFAULT_SETTINGS)
    const installedSet = new Set(Object.keys(getInstalledMap()))
    const depsInstalled = []

    async function installOne(id, modMeta) {
      if (installedSet.has(id)) return null
      installedSet.add(id)

      const download = source === 'curseforge'
        ? await getCurseForgeDownload(id)
        : await getModDownload(id)
      if (!download) return null

      for (const depId of (download.dependencies ?? [])) {
        const depFilename = await installOne(depId, null)
        if (depFilename) depsInstalled.push(depFilename)
      }

      win.webContents.send('admin:add-progress', { step: 'download', filename: download.filename })
      const buffer = await downloadBuffer(download.url)
      win.webContents.send('admin:add-progress', { step: 'upload', filename: download.filename })
      await uploadModToGitHub(download.filename, buffer)
      setInstalledMap({ ...getInstalledMap(), [id]: download.filename })

      // Stocke les métadonnées du mod principal
      if (modMeta) {
        setInstalledMeta({ ...getInstalledMeta(), [id]: modMeta })
      }

      return download.filename
    }

    const filename = await installOne(projectId, meta ?? null)
    if (!filename) throw new Error(
      source === 'curseforge'
        ? 'Aucune version compatible ou mod bloqué (distribution interdite)'
        : 'Aucune version compatible Forge 1.20.1 trouvée'
    )
    await refreshManifest()
    return { filename, deps: depsInstalled }
  })

  ipcMain.handle('admin:import-local-mod', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Importer des mods',
      filters: [{ name: 'Mods Minecraft', extensions: ['jar'] }],
      properties: ['openFile', 'multiSelections']
    })
    if (canceled || filePaths.length === 0) return []

    const settings = store.get('settings', DEFAULT_SETTINGS)
    const results = []
    for (const filePath of filePaths) {
      const filename = basename(filePath)
      win.webContents.send('admin:import-progress', { filename, step: 'upload' })
      const buffer = await readFile(filePath)
      await uploadModToGitHub(filename, buffer)
      setInstalledMap({ ...getInstalledMap(), [`local:${filename}`]: filename })

      results.push(filename)
    }
    await refreshManifest()
    return results
  })

  // --- Contrôle admin de l'auto-update mods ---
  ipcMain.handle('admin:set-auto-update', async (_, autoUpdate) => {
    await pushAutoUpdateOnly(autoUpdate)
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
