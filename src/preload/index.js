import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('launcher', {
  // Fenêtre
  minimize: () => ipcRenderer.send('window:minimize'),
  close: () => ipcRenderer.send('window:close'),

  // Auth
  login: () => ipcRenderer.invoke('auth:login'),
  getProfile: () => ipcRenderer.invoke('auth:profile'),
  logout: () => ipcRenderer.invoke('auth:logout'),

  // Jeu
  launch: () => ipcRenderer.invoke('game:launch'),
  onProgress: (cb) => ipcRenderer.on('game:progress', cb),
  onLog: (cb) => ipcRenderer.on('game:log', cb),
  onGameClose: (cb) => ipcRenderer.on('game:close', cb),

  // Paramètres
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (s) => ipcRenderer.invoke('settings:set', s),

  // Mods
  checkMods: () => ipcRenderer.invoke('mods:check'),
  applyMods: (manifest) => ipcRenderer.invoke('mods:apply', manifest),
  onModsProgress: (cb) => ipcRenderer.on('mods:progress', cb),

  // Admin — bibliothèque de mods
  searchMods: (query, source) => ipcRenderer.invoke('admin:search-mods', { query, source }),
  addMod: (projectId, source) => ipcRenderer.invoke('admin:add-mod', { projectId, source }),
  onAddProgress: (cb) => ipcRenderer.on('admin:add-progress', cb),
  getSuggestions: (source) => ipcRenderer.invoke('admin:get-suggestions', source),
  getInstalledMap: () => ipcRenderer.invoke('admin:get-installed-map'),
  listMods: () => ipcRenderer.invoke('admin:list-mods'),
  deleteMod: (filename) => ipcRenderer.invoke('admin:delete-mod', filename),
  importLocalMod: () => ipcRenderer.invoke('admin:import-local-mod'),
  onImportProgress: (cb) => ipcRenderer.on('admin:import-progress', cb),

  // Mises à jour launcher
  onUpdateAvailable: (cb) => ipcRenderer.on('updater:available', cb),
  onUpdateProgress: (cb) => ipcRenderer.on('updater:progress', cb),
  onUpdateReady: (cb) => ipcRenderer.on('updater:ready', cb),
  installUpdate: () => ipcRenderer.send('updater:install')
})
