import { ipcMain, app, dialog } from 'electron'
import { readFile } from 'fs/promises'
import { basename } from 'path'
import { connect as netConnect } from 'net'
import Store from 'electron-store'
import { login, getSavedProfile, logout } from './auth'
import { launchGame } from './launcher'
import { checkForUpdates, downloadMods, saveLocalManifest } from './modUpdater'
import { searchMods, getModDownload, getSuggestedMods, getVersionByHash, getModInfo } from './modrinth'
import { searchCurseForgeMods, getCurseForgeDownload } from './curseforge'
import { createHash } from 'crypto'
import { downloadBuffer, uploadModToGitHub, listModsOnGitHub, deleteModFromGitHub, pushModsManifest } from './githubUploader'
import { startBot, stopBot, getBotStatus } from './keepaliveBot'

const store = new Store()

const MODS_MANIFEST_URL = 'https://raw.githubusercontent.com/Mycate39/Time-of-Garden/main/mods.json'
const GITHUB_REPO = 'Mycate39/Time-of-Garden'
const SERVER_HOST = 'timeofgarden818.mcsh.io'
const SERVER_PORT = 25565

const DEFAULT_SETTINGS = {
  ramMin: 2,
  ramMax: 4,
  javaPath: 'java',
  githubToken: '',
  serverDescription: ''
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


// Regénère et pousse le mods.json après un changement
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
  await pushModsManifest({ version: newVersion, mods })
  return { version: newVersion, mods }
}

export function registerIpcHandlers(win) {
  // --- Fenêtre ---
  ipcMain.on('window:minimize', () => win.minimize())
  ipcMain.on('window:close', () => app.quit())

  // --- Authentification ---
  ipcMain.handle('auth:login', async () => login())
  ipcMain.handle('auth:profile', async () => getSavedProfile())
  ipcMain.handle('auth:logout', () => logout())

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

  // --- Statut du serveur Minecraft (protocole SLP 1.7+) ---
  ipcMain.handle('server:status', async () => {
    return new Promise((resolve) => {
      const socket = netConnect({ host: SERVER_HOST, port: SERVER_PORT }, () => {
        function varInt(v) {
          const bytes = []
          v = v >>> 0  // unsigned 32-bit
          do {
            let b = v & 0x7F
            v >>>= 7
            if (v !== 0) b |= 0x80
            bytes.push(b)
          } while (v !== 0)
          return Buffer.from(bytes)
        }
        function mcString(str) {
          const buf = Buffer.from(str, 'utf8')
          return Buffer.concat([varInt(buf.length), buf])
        }

        const portBuf = Buffer.alloc(2)
        portBuf.writeUInt16BE(SERVER_PORT)
        // Handshake : ID=0x00, protocol version=765 (1.20.1), adresse, port, nextState=1
        const handshakeData = Buffer.concat([
          varInt(0x00), varInt(765), mcString(SERVER_HOST), portBuf, varInt(1)
        ])
        const handshake = Buffer.concat([varInt(handshakeData.length), handshakeData])
        // Status Request : longueur=1, ID=0x00
        const statusReq = Buffer.from([0x01, 0x00])
        socket.write(Buffer.concat([handshake, statusReq]))
      })

      let resolved = false
      const done = (online) => {
        if (!resolved) { resolved = true; socket.destroy(); resolve({ online }) }
      }

      socket.setTimeout(5000)
      socket.on('data', (chunk) => {
        // Valide que la réponse contient du JSON Minecraft (pas juste n'importe quelle donnée réseau)
        try {
          const str = chunk.toString('utf8')
          const start = str.indexOf('{"')
          const end = str.lastIndexOf('}')
          if (start !== -1 && end > start) {
            const json = JSON.parse(str.slice(start, end + 1))
            if (json.version || json.players || json.description) { done(true); return }
          }
        } catch {}
        done(false)
      })
      socket.on('timeout', () => done(false))
      socket.on('error', () => done(false))
      socket.on('close', () => done(false))
    })
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
  ipcMain.handle('admin:search-mods', async (_, { query, source }) => {
    if (source === 'curseforge') return searchCurseForgeMods(query)
    return searchMods(query)
  })

  ipcMain.handle('admin:get-suggestions', async (_, source) => {
    if (source === 'curseforge') return []
    return getSuggestedMods()
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
    return results
  })

  // --- Bot keepalive ---
  ipcMain.handle('bot:start', () => {
    startBot(({ status, detail }) => {
      win.webContents.send('bot:status', { status, detail: detail ?? '' })
    })
    return { status: getBotStatus() }
  })

  ipcMain.handle('bot:stop', () => {
    stopBot()
    return { status: 'stopped' }
  })

  ipcMain.handle('bot:get-status', () => ({ status: getBotStatus() }))

  // --- Lancement du jeu ---
  ipcMain.handle('game:launch', async () => {
    await launchGame({
      onProgress: (e) => win.webContents.send('game:progress', e),
      onLog: (msg) => win.webContents.send('game:log', String(msg)),
      onClose: (code) => win.webContents.send('game:close', code)
    })
  })
}
