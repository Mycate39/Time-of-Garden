import { get } from 'https'

const USER_AGENT = 'minecraft-launcher/1.0.0'

function modrinthGet(path) {
  return new Promise((resolve, reject) => {
    get(`https://api.modrinth.com/v2${path}`, { headers: { 'User-Agent': USER_AGENT } }, (res) => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())) }
        catch { resolve(null) }
      })
    }).on('error', reject)
  })
}

/**
 * Recherche des mods Modrinth compatibles Forge 1.20.1.
 */
export async function searchMods(query) {
  const facets = encodeURIComponent(JSON.stringify([
    ['categories:forge'],
    ['versions:1.20.1'],
    ['project_type:mod']
  ]))
  const data = await modrinthGet(
    `/search?query=${encodeURIComponent(query)}&facets=${facets}&limit=15`
  )
  return (data?.hits ?? []).map(normalizeHit)
}

function normalizeHit(hit) {
  return {
    project_id: hit.project_id,
    title: hit.title,
    description: hit.description,
    icon_url: hit.icon_url ?? null,
    client_side: hit.client_side ?? null,
    server_side: hit.server_side ?? null,
    source: 'modrinth'
  }
}

/**
 * Retourne les mods Modrinth les plus téléchargés (Forge 1.20.1).
 */
export async function getSuggestedMods() {
  const facets = encodeURIComponent(JSON.stringify([
    ['categories:forge'],
    ['versions:1.20.1'],
    ['project_type:mod']
  ]))
  const data = await modrinthGet(
    `/search?facets=${facets}&index=downloads&limit=12`
  )
  return (data?.hits ?? []).map(normalizeHit)
}

/**
 * Récupère le fichier .jar à télécharger pour un projet Modrinth (1.20.1 + Forge).
 * Retourne { filename, url } ou null si aucune version compatible.
 */
export async function getModDownload(projectId) {
  const versions = await modrinthGet(
    `/project/${projectId}/version?game_versions=%5B%221.20.1%22%5D&loaders=%5B%22forge%22%5D`
  )
  if (!versions || versions.length === 0) return null

  const version = versions[0]
  const file = version.files.find(f => f.primary) || version.files[0]
  if (!file) return null

  const dependencies = (version.dependencies ?? [])
    .filter(d => d.dependency_type === 'required' && d.project_id)
    .map(d => d.project_id)

  return { filename: file.filename, url: file.url, dependencies }
}
