import { Auth } from 'msmc'
import Store from 'electron-store'

const store = new Store()

/**
 * Lance le flux d'authentification Microsoft dans une BrowserWindow Electron.
 * Retourne le profil Minecraft { name, uuid } et sauvegarde le refresh token.
 */
export async function login() {
  const authManager = new Auth('select_account')
  const xboxManager = await authManager.launch('electron')
  const token = await xboxManager.getMinecraft()

  const profile = {
    name: token.profile.name,
    uuid: token.profile.id
  }

  // msmc v5 : Xbox.save() retourne le refresh token (string)
  store.set('auth.refreshToken', xboxManager.save())
  store.set('auth.profile', profile)

  return profile
}

/**
 * Retourne le profil sauvegardé et renouvelle le refresh token si nécessaire.
 * Retourne null si aucun token valide n'existe.
 */
export async function getSavedProfile() {
  const refreshToken = store.get('auth.refreshToken')
  const profile = store.get('auth.profile')

  if (!refreshToken || !profile) return null

  try {
    const authManager = new Auth('select_account')
    const xboxManager = await authManager.refresh(refreshToken)
    store.set('auth.refreshToken', xboxManager.save())
    return profile
  } catch {
    store.delete('auth.refreshToken')
    store.delete('auth.profile')
    return null
  }
}

/**
 * Retourne le token Minecraft au format attendu par minecraft-launcher-core.
 */
export async function getMinecraftToken() {
  const refreshToken = store.get('auth.refreshToken')
  if (!refreshToken) throw new Error('Non authentifié — relance le launcher et connecte-toi.')

  const authManager = new Auth('select_account')
  const xboxManager = await authManager.refresh(refreshToken)
  store.set('auth.refreshToken', xboxManager.save())

  const token = await xboxManager.getMinecraft()
  return token
}

/**
 * Déconnexion — supprime le token sauvegardé.
 */
export function logout() {
  store.delete('auth.refreshToken')
  store.delete('auth.profile')
}
