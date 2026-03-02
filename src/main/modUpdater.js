import { app } from 'electron'
import { existsSync, mkdirSync, readdirSync, rmSync, createWriteStream, readFileSync } from 'fs'
import { join } from 'path'
import { get } from 'https'
import { createHash } from 'crypto'
import { execSync } from 'child_process'
import { platform } from 'os'
import Store from 'electron-store'

const store = new Store()

/**
 * Retourne l'espace disque libre en octets au chemin donné, ou null si indisponible.
 */
function getFreeBytes(dir) {
  try {
    if (platform() === 'win32') {
      const drive = dir.slice(0, 2)
      const out = execSync(`wmic logicaldisk where "DeviceID='${drive}'" get FreeSpace`, { encoding: 'utf8', timeout: 3000 })
      const m = out.match(/(\d+)/)
      return m ? parseInt(m[1]) : null
    } else {
      const out = execSync(`df -k "${dir}"`, { encoding: 'utf8', timeout: 3000 })
      const parts = out.trim().split('\n').pop().trim().split(/\s+/)
      const kb = parseInt(parts[3])
      return isNaN(kb) ? null : kb * 1024
    }
  } catch { return null }
}

/**
 * Vérifie qu'il y a assez d'espace disque libre (500 Mo par défaut).
 * Retourne { ok, freeMB }. Si la vérification échoue, ok = true (on ne bloque pas).
 */
export function checkFreeSpace(dir, requiredBytes = 500 * 1024 * 1024) {
  const free = getFreeBytes(dir)
  if (free === null) return { ok: true }
  return { ok: free >= requiredBytes, freeMB: Math.round(free / (1024 * 1024)) }
}

/**
 * Répertoire où sont stockés les mods téléchargés (userData, persiste entre les mises à jour du launcher).
 */
export function getModsUserDir() {
  const dir = join(app.getPath('userData'), 'mods')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * Récupère le manifest distant depuis l'URL configurée.
 * Retourne null en cas d'erreur réseau ou de JSON invalide.
 */
export function fetchRemoteManifest(url) {
  return new Promise((resolve) => {
    get(url, (res) => {
      // Gestion des redirections
      if (res.statusCode === 301 || res.statusCode === 302) {
        fetchRemoteManifest(res.headers.location).then(resolve)
        return
      }
      if (res.statusCode !== 200) {
        resolve(null)
        return
      }
      let data = ''
      res.on('data', (chunk) => (data += chunk))
      res.on('end', () => {
        try {
          resolve(JSON.parse(data))
        } catch {
          resolve(null)
        }
      })
    }).on('error', () => resolve(null))
  })
}

/**
 * Retourne le manifest stocké localement (electron-store).
 */
export function getLocalManifest() {
  return store.get('mods.manifest', null)
}

/**
 * Sauvegarde le manifest en local.
 */
export function saveLocalManifest(manifest) {
  store.set('mods.manifest', manifest)
}

/**
 * Compare les deux manifests et retourne true si une mise à jour est nécessaire.
 * Force true si le dossier mods est vide (mods jamais téléchargés).
 */
export function hasUpdate(remote, local) {
  if (!local) return true
  if (remote.version !== local.version) return true
  const modsDir = getModsUserDir()
  for (const mod of (remote.mods || [])) {
    if (!existsSync(join(modsDir, mod.filename))) return true
  }
  return false
}

/**
 * Télécharge un fichier depuis une URL vers un chemin local.
 */
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest)
    get(url, (res) => {
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
 * Télécharge tous les mods du manifest dans le dossier userData/mods/.
 * Supprime les anciens mods avant de télécharger.
 * @param {object} manifest - le manifest distant
 * @param {function} onProgress - callback({ current, total, filename })
 */
export async function downloadMods(manifest, onProgress) {
  const modsDir = getModsUserDir()

  // Supprime les anciens mods
  const existing = readdirSync(modsDir).filter((f) => f.endsWith('.jar'))
  for (const f of existing) rmSync(join(modsDir, f))

  const mods = manifest.mods || []
  for (let i = 0; i < mods.length; i++) {
    const mod = mods[i]
    onProgress({ current: i + 1, total: mods.length, filename: mod.filename })
    const dest = join(modsDir, mod.filename)
    await downloadFile(mod.url, dest)
    if (mod.sha1) {
      const actual = createHash('sha1').update(readFileSync(dest)).digest('hex')
      if (actual !== mod.sha1) {
        rmSync(dest, { force: true })
        throw new Error(`Intégrité échouée : ${mod.filename}`)
      }
    }
  }
}

/**
 * Vérifie si une mise à jour est disponible.
 * @param {string} url - URL du mods.json distant
 * @returns {{ hasUpdate: boolean, remoteManifest: object|null, error: string|null }}
 */
export async function checkForUpdates(url) {
  if (!url) return { hasUpdate: false, remoteManifest: null, error: 'Aucune URL configurée' }

  const remote = await fetchRemoteManifest(url)
  if (!remote) return { hasUpdate: false, remoteManifest: null, error: 'Impossible de récupérer le manifest' }

  const local = getLocalManifest()
  return {
    hasUpdate: hasUpdate(remote, local),
    remoteManifest: remote,
    error: null
  }
}
