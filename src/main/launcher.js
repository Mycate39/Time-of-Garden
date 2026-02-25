import { app } from 'electron'
import { Client } from 'minecraft-launcher-core'
import { join } from 'path'
import { existsSync, mkdirSync, readdirSync, copyFileSync, rmSync } from 'fs'
import { createWriteStream } from 'fs'
import { get } from 'https'
import { execSync } from 'child_process'
import { platform } from 'os'
import Store from 'electron-store'
import { getMinecraftToken } from './auth'
import { getModsUserDir } from './modUpdater'

const store = new Store()

const MC_VERSION = '1.20.1'
const FORGE_VERSION = '47.3.0'
const FORGE_INSTALLER_URL =
  `https://maven.minecraftforge.net/net/minecraftforge/forge/` +
  `${MC_VERSION}-${FORGE_VERSION}/forge-${MC_VERSION}-${FORGE_VERSION}-installer.jar`

/**
 * Résout le chemin vers l'exécutable Java.
 * Sur macOS packagé, le PATH du shell n'est pas hérité — on cherche Java manuellement.
 */
function resolveJavaPath(javaPath) {
  if (javaPath && javaPath !== 'java') return javaPath

  if (platform() === 'darwin') {
    // /usr/libexec/java_home est l'outil natif macOS pour localiser le JDK
    try {
      const javaHome = execSync('/usr/libexec/java_home -v 17', { encoding: 'utf8' }).trim()
      if (javaHome) return `${javaHome}/bin/java`
    } catch {
      // java_home non dispo ou Java 17 absent, on essaie les chemins Homebrew
    }

    const candidates = [
      '/opt/homebrew/opt/openjdk@17/bin/java',   // Apple Silicon — Homebrew JDK 17
      '/usr/local/opt/openjdk@17/bin/java',        // Intel — Homebrew JDK 17
      '/opt/homebrew/opt/openjdk/bin/java',        // Apple Silicon — Homebrew dernière version
      '/usr/local/opt/openjdk/bin/java',           // Intel — Homebrew dernière version
    ]
    for (const c of candidates) {
      if (existsSync(c)) return c
    }
  }

  return javaPath || 'java'
}

/**
 * Répertoire de jeu dédié au launcher (séparé de .minecraft officiel).
 * Sur Windows : %APPDATA%\.custom-launcher
 */
function getGameDir() {
  return join(app.getPath('appData'), '.custom-launcher')
}

/**
 * Répertoire source des mods.
 * Priorité : mods téléchargés via modUpdater (userData/mods) s'ils existent,
 * sinon fallback sur les mods embarqués dans le launcher.
 */
function getModsSourceDir() {
  const userModsDir = getModsUserDir()
  const userMods = readdirSync(userModsDir).filter((f) => f.endsWith('.jar'))
  if (userMods.length > 0) return userModsDir

  if (app.isPackaged) {
    return join(process.resourcesPath, 'mods')
  }
  return join(__dirname, '../../resources/mods')
}

/**
 * Télécharge un fichier depuis une URL vers un chemin local.
 */
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest)
    get(url, (res) => {
      // Gestion des redirections HTTP
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close()
        rmSync(dest, { force: true })
        downloadFile(res.headers.location, dest).then(resolve).catch(reject)
        return
      }
      res.pipe(file)
      file.on('finish', () => file.close(resolve))
    }).on('error', (err) => {
      rmSync(dest, { force: true })
      reject(err)
    })
  })
}

/**
 * Synchronise les mods embarqués vers le dossier mods du jeu.
 * Supprime les anciens mods et copie ceux du launcher.
 */
function syncMods(gameDir, onLog) {
  const modsSourceDir = getModsSourceDir()
  const modsDestDir = join(gameDir, 'mods')

  if (!existsSync(modsDestDir)) {
    mkdirSync(modsDestDir, { recursive: true })
  }

  if (!existsSync(modsSourceDir)) {
    onLog('[Launcher] Dossier mods source introuvable, aucun mod copié.')
    return
  }

  // Supprime les mods existants
  const existing = readdirSync(modsDestDir).filter(f => f.endsWith('.jar'))
  for (const f of existing) {
    rmSync(join(modsDestDir, f))
  }

  // Copie les mods du launcher
  const mods = readdirSync(modsSourceDir).filter(f => f.endsWith('.jar'))
  for (const mod of mods) {
    copyFileSync(join(modsSourceDir, mod), join(modsDestDir, mod))
    onLog(`[Launcher] Mod installé : ${mod}`)
  }

  onLog(`[Launcher] ${mods.length} mod(s) synchronisé(s).`)
}

/**
 * Lance Minecraft avec Forge.
 * Émet les événements de progression et de logs via les callbacks.
 */
export async function launchGame({ onProgress, onLog, onClose }) {
  const gameDir = getGameDir()
  const forgeInstallerPath = join(gameDir, `forge-${MC_VERSION}-${FORGE_VERSION}-installer.jar`)
  const settings = store.get('settings', {})

  const ramMin = settings.ramMin || 2
  const ramMax = settings.ramMax || 4
  const serverIp = settings.serverIp || ''
  const javaPath = resolveJavaPath(settings.javaPath || 'java')

  // Création du répertoire de jeu
  if (!existsSync(gameDir)) {
    mkdirSync(gameDir, { recursive: true })
  }

  onLog(`[Launcher] Java : ${javaPath}`)

  // Récupération du token Minecraft
  onLog('[Launcher] Authentification...')
  const token = await getMinecraftToken()

  // Synchronisation des mods
  onLog('[Launcher] Synchronisation des mods...')
  syncMods(gameDir, onLog)

  // Téléchargement de l'installer Forge si nécessaire
  if (!existsSync(forgeInstallerPath)) {
    onLog('[Launcher] Téléchargement de Forge, patientez...')
    await downloadFile(FORGE_INSTALLER_URL, forgeInstallerPath)
    onLog('[Launcher] Forge téléchargé.')
  }

  // Lancement du jeu
  onLog('[Launcher] Démarrage de Minecraft...')
  const launcher = new Client()

  launcher.on('progress', onProgress)
  launcher.on('data', onLog)
  launcher.on('close', onClose)
  launcher.on('package-extract', (e) => onLog(`[Forge] Extraction : ${e.type}`))
  launcher.on('debug', (msg) => onLog(`[Debug] ${msg}`))

  const launchOptions = {
    authorization: token.mclc(),
    root: gameDir,
    version: {
      number: MC_VERSION,
      type: 'release'
    },
    forge: forgeInstallerPath,
    memory: {
      max: `${ramMax}G`,
      min: `${ramMin}G`
    },
    javaPath
  }

  // Connexion directe au serveur si une IP est configurée
  if (serverIp) {
    const [host, port] = serverIp.split(':')
    launchOptions.server = {
      host,
      port: port || '25565'
    }
  }

  await launcher.launch(launchOptions)
}
