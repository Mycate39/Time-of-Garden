import { Auth } from 'msmc'
import Store from 'electron-store'

const store = new Store()

/* ── Helpers store ── */
function getAccounts() { return store.get('auth.accounts', []) }
function setAccounts(a) { store.set('auth.accounts', a) }
function getCurrentUuid() { return store.get('auth.currentUuid', null) }
function setCurrentUuid(uuid) { store.set('auth.currentUuid', uuid) }

/**
 * Migration transparente depuis l'ancien format single-compte.
 */
function migrateIfNeeded() {
  const old = store.get('auth.refreshToken')
  const oldProfile = store.get('auth.profile')
  if (old && oldProfile && getAccounts().length === 0) {
    setAccounts([{ uuid: oldProfile.uuid, name: oldProfile.name, refreshToken: old }])
    setCurrentUuid(oldProfile.uuid)
    store.delete('auth.refreshToken')
    store.delete('auth.profile')
  }
}

/**
 * Ouvre la fenêtre de connexion Microsoft.
 * Ajoute le compte à la liste ou met à jour s'il existe déjà.
 */
export async function login() {
  const authManager = new Auth('select_account')
  const xboxManager = await authManager.launch('electron')
  const token = await xboxManager.getMinecraft()

  const profile = { name: token.profile.name, uuid: token.profile.id }
  const refreshToken = xboxManager.save()
  const account = { uuid: profile.uuid, name: profile.name, refreshToken }

  const accounts = getAccounts()
  const idx = accounts.findIndex(a => a.uuid === profile.uuid)
  if (idx >= 0) accounts[idx] = account
  else accounts.push(account)

  setAccounts(accounts)
  setCurrentUuid(profile.uuid)
  return profile
}

/**
 * Retourne le profil du compte actuel et renouvelle son token.
 * Retourne null si aucun compte valide n'existe.
 */
export async function getSavedProfile() {
  migrateIfNeeded()

  const uuid = getCurrentUuid()
  const accounts = getAccounts()
  if (!uuid || accounts.length === 0) return null

  const account = accounts.find(a => a.uuid === uuid)
  if (!account) return null

  try {
    const authManager = new Auth('select_account')
    const xboxManager = await authManager.refresh(account.refreshToken)
    account.refreshToken = xboxManager.save()
    setAccounts(accounts.map(a => a.uuid === uuid ? account : a))
    return { name: account.name, uuid: account.uuid }
  } catch {
    // Token expiré — retirer ce compte et basculer sur le suivant
    const updated = accounts.filter(a => a.uuid !== uuid)
    setAccounts(updated)
    if (updated.length > 0) {
      setCurrentUuid(updated[0].uuid)
      return { name: updated[0].name, uuid: updated[0].uuid }
    }
    setCurrentUuid(null)
    return null
  }
}

/**
 * Retourne le token Minecraft au format attendu par minecraft-launcher-core.
 */
export async function getMinecraftToken() {
  const uuid = getCurrentUuid()
  const accounts = getAccounts()
  const account = accounts.find(a => a.uuid === uuid)
  if (!account) throw new Error('Non authentifié — relance le launcher et connecte-toi.')

  const authManager = new Auth('select_account')
  const xboxManager = await authManager.refresh(account.refreshToken)
  account.refreshToken = xboxManager.save()
  setAccounts(accounts.map(a => a.uuid === uuid ? account : a))

  return await xboxManager.getMinecraft()
}

/**
 * Déconnexion complète — supprime tous les comptes.
 */
export function logout() {
  store.delete('auth.accounts')
  store.delete('auth.currentUuid')
  store.delete('auth.refreshToken')
  store.delete('auth.profile')
}

/**
 * Retourne la liste des comptes sauvegardés (sans les tokens).
 */
export function listAccounts() {
  migrateIfNeeded()
  const uuid = getCurrentUuid()
  return getAccounts().map(({ uuid: u, name }) => ({ uuid: u, name, current: u === uuid }))
}

/**
 * Bascule sur un compte sauvegardé par uuid.
 * Rafraîchit son token et retourne le profil.
 */
export async function switchAccount(uuid) {
  const accounts = getAccounts()
  const account = accounts.find(a => a.uuid === uuid)
  if (!account) throw new Error('Compte introuvable.')

  try {
    const authManager = new Auth('select_account')
    const xboxManager = await authManager.refresh(account.refreshToken)
    account.refreshToken = xboxManager.save()
    setAccounts(accounts.map(a => a.uuid === uuid ? account : a))
    setCurrentUuid(uuid)
    return { name: account.name, uuid: account.uuid }
  } catch {
    setAccounts(accounts.filter(a => a.uuid !== uuid))
    throw new Error('Session expirée pour ce compte. Reconnecte-toi.')
  }
}
