import { request as httpsRequest, get as httpsGet } from 'https'
import Store from 'electron-store'

const store = new Store()
const GITHUB_REPO = 'Mycate39/Time-of-Garden'

function getToken() {
  return (store.get('settings.githubToken', '') || '').trim()
}

function apiGet(path) {
  const token = getToken()
  const headers = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'minecraft-launcher'
  }
  if (token) headers.Authorization = `Bearer ${token}`
  return new Promise((resolve, reject) => {
    const req = httpsRequest({
      hostname: 'api.github.com',
      path,
      method: 'GET',
      headers
    }, (res) => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(Buffer.concat(chunks).toString()) }) }
        catch { resolve({ status: res.statusCode, data: null }) }
      })
    })
    req.on('error', reject)
    req.end()
  })
}

function apiPut(path, body) {
  return new Promise((resolve, reject) => {
    const payload = Buffer.from(JSON.stringify(body))
    const req = httpsRequest({
      hostname: 'api.github.com',
      path,
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${getToken()}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'minecraft-launcher',
        'Content-Type': 'application/json',
        'Content-Length': payload.length
      }
    }, (res) => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(Buffer.concat(chunks).toString()) }) }
        catch { resolve({ status: res.statusCode, data: null }) }
      })
    })
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

/**
 * Télécharge un fichier depuis une URL et retourne un Buffer.
 * Suit les redirections HTTP automatiquement.
 */
export function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    httpsGet(url, { headers: { 'User-Agent': 'minecraft-launcher' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        downloadBuffer(res.headers.location).then(resolve).catch(reject)
        return
      }
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks)))
    }).on('error', reject)
  })
}

/**
 * Retourne la liste des fichiers dans le dossier mods/ du repo GitHub.
 * Retourne un tableau de { filename, sha }.
 */
export async function listModsOnGitHub() {
  const { status, data } = await apiGet(`/repos/${GITHUB_REPO}/contents/mods`)
if (status !== 200 || !Array.isArray(data)) return []
  return data
    .filter(f => f.type === 'file' && f.name.endsWith('.jar'))
    .map(f => ({ filename: f.name, sha: f.sha }))
}

/**
 * Supprime un fichier .jar du repo GitHub.
 */
export async function deleteModFromGitHub(filename) {
  const encodedName = encodeURIComponent(filename)
  const { status, data } = await apiGet(`/repos/${GITHUB_REPO}/contents/mods/${encodedName}`)
  if (status !== 200) throw new Error(`Fichier introuvable sur GitHub (${status})`)
  const sha = data.sha

  const payload = Buffer.from(JSON.stringify({
    message: `Remove mod: ${filename}`,
    sha,
    branch: 'main'
  }))

  const result = await new Promise((resolve, reject) => {
    const req = httpsRequest({
      hostname: 'api.github.com',
      path: `/repos/${GITHUB_REPO}/contents/mods/${encodedName}`,
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${getToken()}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'minecraft-launcher',
        'Content-Type': 'application/json',
        'Content-Length': payload.length
      }
    }, (res) => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode }))
    })
    req.on('error', reject)
    req.write(payload)
    req.end()
  })

  if (result.status !== 200 && result.status !== 204) {
    throw new Error(`GitHub delete failed (${result.status})`)
  }
}

/**
 * Pousse un nouveau mods.json sur le repo GitHub.
 * Crée le fichier s'il n'existe pas encore, le met à jour sinon.
 */
export async function pushModsManifest(manifest) {
  const content = Buffer.from(JSON.stringify(manifest, null, 2)).toString('base64')
  const { status: getStatus, data: existing } = await apiGet(`/repos/${GITHUB_REPO}/contents/mods.json`)
  const sha = getStatus === 200 ? existing.sha : undefined

  const body = {
    message: `chore: update mods manifest v${manifest.version}`,
    content,
    branch: 'main'
  }
  if (sha) body.sha = sha

  const result = await apiPut(`/repos/${GITHUB_REPO}/contents/mods.json`, body)
  if (result.status !== 200 && result.status !== 201) {
    throw new Error(`GitHub manifest push failed (${result.status})`)
  }
}

/**
 * Upload un fichier .jar vers le repo GitHub.
 * Si le fichier existe déjà, le met à jour.
 */
export async function uploadModToGitHub(filename, buffer) {
  const encodedName = encodeURIComponent(filename)

  // Récupère le SHA si le fichier existe déjà (nécessaire pour mise à jour)
  const { status, data } = await apiGet(`/repos/${GITHUB_REPO}/contents/mods/${encodedName}`)
  const sha = status === 200 ? data.sha : undefined

  const body = {
    message: sha ? `Update mod: ${filename}` : `Add mod: ${filename}`,
    content: buffer.toString('base64'),
    branch: 'main'
  }
  if (sha) body.sha = sha

  const result = await apiPut(`/repos/${GITHUB_REPO}/contents/mods/${encodedName}`, body)
  if (result.status !== 200 && result.status !== 201) {
    throw new Error(`GitHub upload failed (${result.status})`)
  }
}
