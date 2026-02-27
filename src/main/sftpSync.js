import SFTPClient from 'ssh2-sftp-client'
import { downloadBuffer } from './githubUploader'

const GITHUB_REPO = 'Mycate39/Time-of-Garden'

const SFTP_HOST = 'anteros.mcserverhost.com'
const SFTP_PORT = 2022
const SFTP_USER = 'caca.b363b241'
const SFTP_MODS_PATH = '/mods'

export function hasSftpConfig(settings) {
  return !!(settings?.sftpPassword)
}

function makeConnection(settings) {
  return {
    host: SFTP_HOST,
    port: SFTP_PORT,
    username: SFTP_USER,
    password: settings.sftpPassword,
    readyTimeout: 10000
  }
}

/**
 * Uploade un seul .jar vers le serveur SFTP.
 */
export async function uploadToServer(settings, filename, buffer) {
  if (!hasSftpConfig(settings)) return
  const sftp = new SFTPClient()
  try {
    await sftp.connect(makeConnection(settings))
    await sftp.put(buffer, `${SFTP_MODS_PATH}/${filename}`)
  } finally {
    try { await sftp.end() } catch {}
  }
}

/**
 * Supprime un .jar du serveur SFTP.
 */
export async function deleteFromServer(settings, filename) {
  if (!hasSftpConfig(settings)) return
  const sftp = new SFTPClient()
  try {
    await sftp.connect(makeConnection(settings))
    await sftp.delete(`${SFTP_MODS_PATH}/${filename}`).catch(() => {})
  } finally {
    try { await sftp.end() } catch {}
  }
}

/**
 * Synchronisation complète : télécharge tous les mods depuis GitHub
 * et les déploie sur le serveur SFTP.
 * Supprime les mods sur le serveur qui ne sont plus dans la liste.
 */
export async function syncAllToServer(settings, modList, onProgress) {
  if (!hasSftpConfig(settings)) throw new Error('Mot de passe SFTP non configuré dans les paramètres')
  const sftp = new SFTPClient()
  try {
    await sftp.connect(makeConnection(settings))

    // S'assure que le dossier distant existe
    await sftp.mkdir(SFTP_MODS_PATH, true).catch(() => {})

    // Liste les fichiers actuellement sur le serveur
    const serverList = await sftp.list(SFTP_MODS_PATH).catch(() => [])
    const serverJars = new Set(serverList.filter(f => f.name.endsWith('.jar')).map(f => f.name))
    const targetJars = new Set(modList.map(m => m.filename))

    // Supprime les .jar obsolètes
    for (const filename of serverJars) {
      if (!targetJars.has(filename)) {
        await sftp.delete(`${SFTP_MODS_PATH}/${filename}`).catch(() => {})
      }
    }

    // Télécharge depuis GitHub et upload sur le serveur
    for (let i = 0; i < modList.length; i++) {
      const { filename } = modList[i]
      onProgress?.({ current: i + 1, total: modList.length, filename })
      const url = `https://raw.githubusercontent.com/${GITHUB_REPO}/main/mods/${encodeURIComponent(filename)}`
      const buffer = await downloadBuffer(url)
      await sftp.put(buffer, `${SFTP_MODS_PATH}/${filename}`)
    }
  } finally {
    try { await sftp.end() } catch {}
  }
}
