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
  searchMods: (query) => ipcRenderer.invoke('admin:search-mods', { query }),
  addMod: (projectId, source, meta) => ipcRenderer.invoke('admin:add-mod', { projectId, source, meta }),
  onAddProgress: (cb) => ipcRenderer.on('admin:add-progress', cb),
  getSuggestions: () => ipcRenderer.invoke('admin:get-suggestions'),
  getInstalledMap: () => ipcRenderer.invoke('admin:get-installed-map'),
  listMods: () => ipcRenderer.invoke('admin:list-mods'),
  deleteMod: (filename) => ipcRenderer.invoke('admin:delete-mod', filename),
  importLocalMod: () => ipcRenderer.invoke('admin:import-local-mod'),
  onImportProgress: (cb) => ipcRenderer.on('admin:import-progress', cb),
  checkModUpdates: () => ipcRenderer.invoke('admin:check-mod-updates'),
  applyModUpdate: (data) => ipcRenderer.invoke('admin:apply-mod-update', data),
  onModUpdateProgress: (cb) => ipcRenderer.on('admin:mod-update-progress', cb),

  // Statut serveur Minecraft
  serverStatus: () => ipcRenderer.invoke('server:status'),

  // Bot keepalive
  startBot: () => ipcRenderer.invoke('bot:start'),
  stopBot: () => ipcRenderer.invoke('bot:stop'),
  getBotStatus: () => ipcRenderer.invoke('bot:get-status'),
  onBotStatus: (cb) => ipcRenderer.on('bot:status', cb),

  // Mises à jour launcher
  onUpdateAvailable: (cb) => ipcRenderer.on('updater:available', cb),
  onUpdateProgress: (cb) => ipcRenderer.on('updater:progress', cb),
  onUpdateReady: (cb) => ipcRenderer.on('updater:ready', cb),
  installUpdate: () => ipcRenderer.send('updater:install')
})
