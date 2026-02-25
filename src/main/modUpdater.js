import { app } from 'electron'
import { existsSync, mkdirSync, readdirSync, rmSync, createWriteStream } from 'fs'
import { join } from 'path'
import { get } from 'https'
import Store from 'electron-store'

const store = new Store()

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
 */
export function hasUpdate(remote, local) {
  if (!local) return true
  return remote.version !== local.version
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
    await downloadFile(mod.url, join(modsDir, mod.filename))
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
