import { request as httpsRequest } from 'https'

const CF_API_KEY = '$2a$10$rEHqr1pJmFRh4AKCuBCrX.CBiWsGD186Z14RPwsXb6nJ68VlvQ3mS'
const CF_HOST = 'api.curseforge.com'
const MINECRAFT_GAME_ID = 432
const FORGE_LOADER_TYPE = 1

function cfGet(path) {
  return new Promise((resolve, reject) => {
    const req = httpsRequest({
      hostname: CF_HOST,
      path,
      method: 'GET',
      headers: {
        'x-api-key': CF_API_KEY,
        'Accept': 'application/json',
        'User-Agent': 'minecraft-launcher'
      }
    }, (res) => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())) }
        catch { resolve(null) }
      })
    })
    req.on('error', reject)
    req.end()
  })
}

/**
 * Recherche des mods CurseForge compatibles Forge 1.20.1.
 * Retourne un format normalisé identique à Modrinth.
 */
export async function searchCurseForgeMods(query) {
  const path = `/v1/mods/search?gameId=${MINECRAFT_GAME_ID}&classId=6&searchFilter=${encodeURIComponent(query)}&modLoaderType=${FORGE_LOADER_TYPE}&gameVersion=1.20.1&pageSize=15`
  const data = await cfGet(path)
  return (data?.data ?? []).map(mod => ({
    project_id: String(mod.id),
    title: mod.name,
    description: mod.summary ?? '',
    icon_url: mod.logo?.thumbnailUrl ?? null,
    source: 'curseforge'
  }))
}

/**
 * Retourne les mods CurseForge les plus téléchargés (Forge 1.20.1).
 */
export async function getSuggestedCurseForgeMods() {
  const path = `/v1/mods/search?gameId=${MINECRAFT_GAME_ID}&modLoaderType=${FORGE_LOADER_TYPE}&classId=6&pageSize=12&sortField=2&sortOrder=desc`
  const data = await cfGet(path)
  return (data?.data ?? []).map(mod => ({
    project_id: String(mod.id),
    title: mod.name,
    description: mod.summary ?? '',
    icon_url: mod.logo?.thumbnailUrl ?? null,
    source: 'curseforge'
  }))
}

/**
 * Récupère le fichier .jar à télécharger pour un mod CurseForge.
 * Retourne { filename, url } ou null si indisponible (mod bloqué).
 */
export async function getCurseForgeDownload(modId) {
  const filesData = await cfGet(
    `/v1/mods/${modId}/files?gameVersion=1.20.1&modLoaderType=${FORGE_LOADER_TYPE}&pageSize=1`
  )
  const files = filesData?.data ?? []
  if (files.length === 0) return null

  const file = files[0]
  const urlData = await cfGet(`/v1/mods/${modId}/files/${file.id}/download-url`)
  const url = urlData?.data
  if (!url) return null // Ce mod interdit le téléchargement tiers

  // relationType 3 = RequiredDependency
  const dependencies = (file.dependencies ?? [])
    .filter(d => d.relationType === 3)
    .map(d => String(d.modId))

  return { filename: file.fileName, url, dependencies }
}
