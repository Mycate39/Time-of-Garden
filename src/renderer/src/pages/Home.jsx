import { useState, useEffect, useRef, useCallback } from 'react'
import Titlebar from '../components/Titlebar'
import ProgressBar from '../components/ProgressBar'
import ConsoleLog from '../components/ConsoleLog'
import logo from '../assets/logo.png'

const ADMIN_USERNAME = 'Mycate39'

const LOADING_TIPS = [
  '💡 Appuie sur M pour ouvrir la carte du monde (Xaero)',
  '💡 Cherche des recettes avec Ctrl+F dans JEI',
  '💡 Survole une machine Create et appuie sur W pour voir son tutoriel',
  '💡 Appuie sur B pour ouvrir ton sac à dos',
  '💡 U ouvre les waypoints, J crée un nouveau waypoint',
  '💡 C pour zoomer (OkZoomer)',
  '💡 K active ou désactive les shaders',
  '💡 F4 passe en mode caméra libre (Freecam)',
  '💡 V active le chat vocal (Simple Voice Chat)',
  '💡 Alt+clic gauche pour remplir un Copycat avec un bloc',
  '💡 X interagit avec ton inventaire depuis le sac à dos',
  '💡 Ctrl+Z / Ctrl+Y pour annuler/refaire avec Effortless Building',
]

function parseModName(filename) {
  let name = filename.replace(/\.jar$/, '')
  name = name.replace(/-(?:forge|neoforge|fabric|mc|MC)-?\d.*$/i, '')
  name = name.replace(/-\d[\d.]+.*$/, '')
  return name.split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

const SPLASH_TEXTS = [
  'Creeper, aw man!',
  'Also try Terraria!',
  "C'est explosif!",
  'Steve was here!',
  'Prépare ton inventaire!',
  'GG à la team!',
  'Chargement des chunks...',
  'Diamond sword > Iron sword',
  "Nether, j'arrive!",
  '1.20.1 forever!',
  'Forge master race',
  'Pas de lags... promis!',
  '// TODO: play more',
  'Bon courage !',
  'Never dig down!',
  'Moddé à fond !',
]

export default function Home({ profile, onSettings, onModLibrary, onLogout, onSwitchAccount }) {
  const [splashText] = useState(() => SPLASH_TEXTS[Math.floor(Math.random() * SPLASH_TEXTS.length)])
  const [status, setStatus] = useState('idle') // 'idle' | 'launching' | 'playing' | 'error'
  const [progress, setProgress] = useState(null)
  const [logs, setLogs] = useState([])
  const [showLogs, setShowLogs] = useState(false)
  const [logsCopied, setLogsCopied] = useState(false)
  // Mods update
  const [modsUpdate, setModsUpdate] = useState(null)
  const [modsStatus, setModsStatus] = useState('idle')
  const [modsProgress, setModsProgress] = useState(null)
  const [offline, setOffline] = useState(false)
  const [changelog, setChangelog] = useState(null)
  const [installedVersion, setInstalledVersion] = useState(null)

  // News
  const [news, setNews] = useState(null)
  const [newsDismissed, setNewsDismissed] = useState(false)

  // Session timer
  const sessionStartRef = useRef(null)
  const [sessionDuration, setSessionDuration] = useState(null)

  // Logs ref (pour accès dans les callbacks sans closure stale)
  const logsRef = useRef([])
  useEffect(() => { logsRef.current = logs }, [logs])

  // Paramètre minimiser au lancement
  const minimizeOnLaunchRef = useRef(true)

  // Welcome modal (premier lancement)
  const [showWelcome, setShowWelcome] = useState(() => !localStorage.getItem('tog:welcomeSeen'))

  // Loading tips
  const [currentTip, setCurrentTip] = useState(0)

  // Mod list modal
  const [showModList, setShowModList] = useState(false)
  const [modsList, setModsList] = useState([])

  // RAM faible
  const [lowRam, setLowRam] = useState(false)
  const [ramValue, setRamValue] = useState(null)

  // Version du launcher
  const [appVersion, setAppVersion] = useState(null)

  // Launcher auto-update — modal flow
  const [updateModal, setUpdateModal] = useState(null)   // null | { version }
  const [updateDlPct, setUpdateDlPct] = useState(null)  // null | 0-100
  const [updateReady, setUpdateReady] = useState(false)

  // Account menu dropdown
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [savedAccounts, setSavedAccounts] = useState([])
  const [switchingUuid, setSwitchingUuid] = useState(null)
  const accountMenuRef = useRef(null)

  const closeAccountMenu = useCallback((e) => {
    if (accountMenuRef.current && !accountMenuRef.current.contains(e.target)) {
      setAccountMenuOpen(false)
    }
  }, [])

  useEffect(() => {
    if (accountMenuOpen) {
      document.addEventListener('mousedown', closeAccountMenu)
      window.launcher.getAccounts().then(setSavedAccounts)
    } else {
      document.removeEventListener('mousedown', closeAccountMenu)
    }
    return () => document.removeEventListener('mousedown', closeAccountMenu)
  }, [accountMenuOpen, closeAccountMenu])

  const handleSwitchAccount = async (uuid) => {
    if (uuid === profile?.uuid) { setAccountMenuOpen(false); return }
    setSwitchingUuid(uuid)
    try {
      const newProfile = await window.launcher.switchAccount(uuid)
      onSwitchAccount(newProfile)
    } catch {}
    setSwitchingUuid(null)
    setAccountMenuOpen(false)
  }

  const handleAddAccount = async () => {
    setAccountMenuOpen(false)
    try {
      const newProfile = await window.launcher.login()
      onSwitchAccount(newProfile)
    } catch {}
  }

  useEffect(() => {
    window.launcher.onProgress((_, e) => setProgress(e))

    window.launcher.onLog((_, msg) => {
      setLogs(prev => [...prev.slice(-200), msg])
    })

    window.launcher.onGameClose((_, code) => {
      if (sessionStartRef.current) {
        const ms = Date.now() - sessionStartRef.current
        const m = Math.floor(ms / 60000)
        const h = Math.floor(m / 60)
        setSessionDuration(h > 0 ? `${h}h ${m % 60}m` : `${m}m`)
        sessionStartRef.current = null
      }
      const closeMsg = `[Launcher] Jeu fermé (code ${code})`
      // Sauvegarde des logs dans un fichier
      const allLogs = [...logsRef.current, closeMsg].join('\n')
      window.launcher.saveLogs(allLogs).catch(() => {})
      setStatus('idle')
      setProgress(null)
      setLogs(prev => [...prev, closeMsg])
      checkModsUpdate()
    })

    window.launcher.onGameCrash((_, report) => {
      setShowLogs(true)
      setLogs(prev => [...prev, '\n── CRASH REPORT ──', ...report.split('\n').slice(0, 40)])
    })

    window.launcher.onModsProgress((_, p) => setModsProgress(p))

    // Launcher update events
    window.launcher.onUpdateAvailable((_, info) => {
      setUpdateModal({ version: info.version })
    })
    window.launcher.onUpdateProgress((_, pct) => setUpdateDlPct(pct))
    window.launcher.onUpdateReady(() => {
      setUpdateDlPct(100)
      setUpdateReady(true)
    })

    checkModsUpdate()
    window.launcher.getSettings().then(s => {
      if (s.ram < 4) { setLowRam(true); setRamValue(s.ram) }
      minimizeOnLaunchRef.current = s.minimizeOnLaunch ?? true
    })
    window.launcher.getVersion().then(setAppVersion)
  }, [])

  // Rotation des tips pendant le chargement
  useEffect(() => {
    if (status !== 'launching') return
    const interval = setInterval(() => {
      setCurrentTip(t => (t + 1) % LOADING_TIPS.length)
    }, 3500)
    return () => clearInterval(interval)
  }, [status])

  const handleInstallMods = async (update) => {
    const target = update ?? modsUpdate
    if (!target) return
    setModsStatus('downloading')
    setModsProgress(null)
    try {
      await window.launcher.applyMods(target.remoteManifest)
      setModsStatus('done')
      setModsUpdate(null)
    } catch {
      setModsStatus('idle')
    }
  }

  const checkModsUpdate = async () => {
    setModsStatus('checking')
    try {
      const result = await window.launcher.checkMods()
      setOffline(!!result.offline)
      if (result.localVersion) setInstalledVersion(result.localVersion)
      if (result.remoteManifest?.mods) setModsList(result.remoteManifest.mods)
      if (result.news) {
        setNews(result.news)
        setNewsDismissed(false)
      }
      if (result.hasUpdate && !result.error) {
        const update = { version: result.version, count: result.count, remoteManifest: result.remoteManifest }
        if (result.changelog) setChangelog(result.changelog)
        if (result.autoUpdate) {
          await handleInstallMods(update)
          return
        }
        setModsUpdate(update)
      }
    } catch {}
    setModsStatus('idle')
  }

  const handleRepairMods = async () => {
    setModsStatus('downloading')
    setModsProgress(null)
    try {
      const result = await window.launcher.checkMods()
      if (result.remoteManifest) {
        await window.launcher.applyMods(result.remoteManifest)
        setModsStatus('done')
      } else {
        setModsStatus('idle')
      }
    } catch {
      setModsStatus('idle')
    }
  }

  const handleCopyLogs = () => {
    navigator.clipboard.writeText(logs.join('\n'))
    setLogsCopied(true)
    setTimeout(() => setLogsCopied(false), 2000)
  }

  const handlePlay = async () => {
    setStatus('launching')
    setLogs([])
    setProgress(null)
    try {
      await window.launcher.launch()
      setStatus('playing')
      sessionStartRef.current = Date.now()
      // Notification système
      try { new Notification('Time of Garden', { body: '✓ Minecraft est prêt à jouer !' }) } catch {}
      // Minimiser le launcher
      if (minimizeOnLaunchRef.current) window.launcher.minimize()
    } catch (e) {
      setStatus('error')
      setLogs(prev => [...prev, `[Erreur] ${e.message}`])
    }
  }

  // Auto-update modal actions
  const handleStartDownload = () => {
    setUpdateDlPct(0)
    window.launcher.downloadUpdate()
  }

  const handleInstallUpdate = () => {
    window.launcher.installUpdate()
  }

  const handleDismissUpdate = () => {
    setUpdateModal(null)
    setUpdateDlPct(null)
    setUpdateReady(false)
  }

  const isDownloading = updateDlPct !== null && !updateReady

  return (
    <>
      <Titlebar />

      {/* ── Modal Bienvenue (premier lancement) ── */}
      {showWelcome && (
        <div className="modal-overlay">
          <div className="modal-box welcome-modal">
            <div className="modal-title">Bienvenue sur Time of Garden ! 🌿</div>
            <div className="modal-desc" style={{ color: 'var(--text-muted)', marginBottom: 4 }}>
              Forge 1.20.1 — Modpack industriel &amp; aventure
            </div>

            <div className="welcome-section">
              <div className="welcome-section-title">Rejoindre le monde</div>
              <div className="welcome-section-body">
                Ouvre Minecraft → Multijoueur → <strong>Connexion directe</strong><br />
                ou attends l'invitation LAN de l'hôte en jeu.
              </div>
            </div>

            <div className="welcome-section">
              <div className="welcome-section-title">Touches essentielles</div>
              <div className="welcome-keybinds">
                <div className="wb-row"><kbd>M</kbd><span>Carte du monde (Xaero)</span></div>
                <div className="wb-row"><kbd>Ctrl+F</kbd><span>Rechercher dans JEI</span></div>
                <div className="wb-row"><kbd>W</kbd><span>Tutoriel machine Create (Ponder)</span></div>
                <div className="wb-row"><kbd>B</kbd><span>Ouvrir le sac à dos</span></div>
                <div className="wb-row"><kbd>U</kbd><span>Waypoints Xaero</span></div>
                <div className="wb-row"><kbd>C</kbd><span>Zoom (OkZoomer)</span></div>
                <div className="wb-row"><kbd>K</kbd><span>Activer/désactiver les shaders</span></div>
                <div className="wb-row"><kbd>V</kbd><span>Chat vocal</span></div>
              </div>
            </div>

            <div className="welcome-section">
              <div className="welcome-section-title">Mods principaux</div>
              <div className="welcome-section-body" style={{ color: 'var(--text-muted)' }}>
                Create · JEI · Xaero's Maps · Sophisticated Backpacks · Effortless Building · SecurityCraft · Iris Shaders · Simple Voice Chat
              </div>
            </div>

            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button className="btn-ghost" onClick={() => setShowWelcome(false)}>Afficher à nouveau</button>
              <button className="btn-primary" onClick={() => {
                localStorage.setItem('tog:welcomeSeen', '1')
                setShowWelcome(false)
              }}>C'est parti !</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal liste des mods ── */}
      {showModList && (
        <div className="modal-overlay" onClick={() => setShowModList(false)}>
          <div className="modal-box modlist-modal" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div className="modal-title">Mods installés ({modsList.length})</div>
              <button className="btn-ghost" style={{ padding: '4px 10px' }} onClick={() => setShowModList(false)}>✕</button>
            </div>
            <div className="modlist-grid">
              {modsList.map(m => (
                <div key={m.filename} className="modlist-item" title={m.filename}>
                  {parseModName(m.filename)}
                </div>
              ))}
              {modsList.length === 0 && (
                <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Aucun mod chargé.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Launcher update modal ── */}
      {updateModal && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className="modal-gear">⚙</span>
              <div>
                <div className="modal-title">Mise à jour disponible</div>
                <div className="modal-version">v{updateModal.version}</div>
              </div>
            </div>

            {!isDownloading && !updateReady && (
              <>
                <div className="modal-desc">
                  Une nouvelle version du launcher est disponible. Voulez-vous la télécharger maintenant ?<br />
                  Le jeu sera redémarré après l'installation.
                </div>
                <div className="modal-actions">
                  <button className="btn-ghost" onClick={handleDismissUpdate}>Plus tard</button>
                  <button className="btn-primary" onClick={handleStartDownload}>Télécharger</button>
                </div>
              </>
            )}

            {isDownloading && (
              <div className="modal-progress">
                <div className="modal-progress-label">
                  <span>Téléchargement en cours...</span>
                  <span>{updateDlPct ?? 0}%</span>
                </div>
                <div className="modal-progress-track">
                  <div className="modal-progress-fill" style={{ width: `${Math.max(updateDlPct ?? 0, 3)}%` }} />
                </div>
              </div>
            )}

            {updateReady && (
              <>
                <div className="modal-desc" style={{ color: 'var(--green-bright)' }}>
                  ✓ Mise à jour téléchargée et prête à installer.
                </div>
                <div className="modal-actions">
                  <button className="btn-ghost" onClick={handleDismissUpdate}>Redémarrer plus tard</button>
                  <button className="btn-primary" onClick={handleInstallUpdate}>Redémarrer et installer</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div className="home-page">
        <div className="home-content">

          {/* ── Sidebar ── */}
          <aside className="home-sidebar">
            <div className="sidebar-bg-gear">⚙</div>

            {/* Logo */}
            <div className="logo-section">
              <div className="logo-gear-wrap">
                <div className="logo-gear-outer">⚙</div>
                <div className="logo-gear-inner">⚙</div>
                <img src={logo} alt="Time of Garden" className="server-logo" />
              </div>
              <div className="server-name">Time of{'\n'}Garden</div>
              <div className="server-version">Forge 1.20.1</div>
              {appVersion && <div className="launcher-version">v{appVersion}</div>}
              <div className="splash-text">{splashText}</div>
            </div>

            <div className="sidebar-sep" />

            {/* Player */}
            <div className="player-card-wrap" ref={accountMenuRef}>
              <div
                className={`player-card clickable${accountMenuOpen ? ' active' : ''}`}
                onClick={() => setAccountMenuOpen(o => !o)}
                title="Gérer le compte"
              >
                <div className="player-avatar">
                  {profile?.name
                    ? <img
                        src={`https://mc-heads.net/avatar/${profile.name}/64`}
                        alt="skin" className="player-skin-img"
                        onError={e => { e.currentTarget.style.display = 'none' }}
                      />
                    : '👤'
                  }
                </div>
                <div className="player-info">
                  <div className="player-name">{profile?.name ?? '???'}</div>
                  <div className="player-label">Compte Minecraft</div>
                </div>
                <span className="player-card-arrow">{accountMenuOpen ? '▲' : '▼'}</span>
              </div>

              {accountMenuOpen && (
                <div className="account-menu">
                  {/* Comptes sauvegardés */}
                  {savedAccounts.map(acc => (
                    <button
                      key={acc.uuid}
                      className={`account-menu-item${acc.current ? ' current' : ''}`}
                      onClick={() => handleSwitchAccount(acc.uuid)}
                      disabled={switchingUuid === acc.uuid}
                    >
                      <img
                        src={`https://mc-heads.net/avatar/${acc.name}/32`}
                        alt="" className="account-menu-avatar"
                        onError={e => { e.currentTarget.style.display = 'none' }}
                      />
                      <span className="account-menu-name">{acc.name}</span>
                      {acc.current && <span className="account-menu-check">✓</span>}
                      {switchingUuid === acc.uuid && <span className="account-menu-loading">⚙</span>}
                    </button>
                  ))}

                  <div className="account-menu-sep" />

                  {/* Ajouter un compte */}
                  <button className="account-menu-item add" onClick={handleAddAccount}>
                    <span>＋</span> Ajouter un compte
                  </button>

                  {/* Déconnexion complète */}
                  <button className="account-menu-item danger" onClick={() => { setAccountMenuOpen(false); onLogout() }}>
                    <span>✕</span> Se déconnecter
                  </button>
                </div>
              )}
            </div>

          </aside>

          {/* ── Main panel ── */}
          <div className="home-main">
            <div className="main-bg-gear">⚙</div>

            {/* Alerte RAM faible */}
            {lowRam && status === 'idle' && (
              <div className="mods-banner" style={{ background: 'rgba(200,80,0,0.12)', borderColor: 'var(--copper)' }}>
                <span style={{ color: 'var(--copper)' }}>⚠ RAM allouée : {ramValue} Go — recommandé : 4 Go minimum</span>
                <button className="btn-ghost" onClick={onSettings} style={{ whiteSpace: 'nowrap' }}>Paramètres</button>
              </div>
            )}

            {/* Offline indicator */}
            {offline && (
              <div className="mods-banner" style={{ background: 'rgba(180,100,0,0.15)', borderColor: 'var(--copper)' }}>
                <span style={{ color: 'var(--copper)' }}>⚠ Mode hors-ligne — vérification des mods impossible</span>
              </div>
            )}

            {/* News banner */}
            {news && !newsDismissed && (
              <div className="mods-banner update" style={{ background: 'rgba(72,152,200,0.12)', borderColor: 'var(--blueprint)' }}>
                <div className="mods-banner-info">
                  <strong style={{ color: 'var(--blueprint)' }}>📢 Nouveautés</strong>
                  <span style={{ whiteSpace: 'pre-line' }}>{news}</span>
                </div>
                <button className="btn-ghost" onClick={() => setNewsDismissed(true)}>OK</button>
              </div>
            )}

            {/* Mods update banners */}
            {modsStatus === 'checking' && (
              <div className="mods-banner">
                <span>⚙ Vérification des mods...</span>
              </div>
            )}

            {modsUpdate && modsStatus === 'idle' && (
              <div className="mods-banner update">
                <div className="mods-banner-info">
                  <strong>Mise à jour des mods disponible</strong>
                  <span>Version {modsUpdate.version} — {modsUpdate.count} mod(s)</span>
                  {changelog && (changelog.added.length > 0 || changelog.removed.length > 0) && (
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {changelog.added.length > 0 && `+${changelog.added.length} ajouté(s)`}
                      {changelog.added.length > 0 && changelog.removed.length > 0 && ' · '}
                      {changelog.removed.length > 0 && `-${changelog.removed.length} retiré(s)`}
                    </span>
                  )}
                </div>
                <div className="mods-banner-actions">
                  <button className="btn-primary" onClick={handleInstallMods}>Installer</button>
                  <button className="btn-ghost" onClick={() => { setModsUpdate(null); setModsStatus('idle') }}>
                    Plus tard
                  </button>
                </div>
              </div>
            )}

            {modsStatus === 'downloading' && (
              <div className="mods-banner downloading">
                <div className="mods-banner-info">
                  <strong>⬇ Téléchargement des mods...</strong>
                  {modsProgress && (
                    <span>{modsProgress.current}/{modsProgress.total} — {modsProgress.filename}</span>
                  )}
                </div>
                <div className="mods-progress-track">
                  <div
                    className="mods-progress-fill"
                    style={{
                      width: modsProgress
                        ? `${Math.round((modsProgress.current / modsProgress.total) * 100)}%`
                        : '5%'
                    }}
                  />
                </div>
              </div>
            )}

            {modsStatus === 'done' && (
              <div className="mods-banner success">
                <span>✓ Mods mis à jour avec succès !</span>
                <button className="btn-ghost" onClick={() => setModsStatus('idle')}>OK</button>
              </div>
            )}

            {/* Launch section */}
            <div className="launch-section">
              {(status === 'idle' || status === 'error') && (
                <>
                  <button className="play-btn" onClick={handlePlay}>
                    ▶ Jouer
                  </button>
                  {status === 'idle' && sessionDuration && (
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                      Dernière session : {sessionDuration}
                    </span>
                  )}
                  {status === 'error' && (
                    <span style={{ color: 'var(--red)', fontSize: 14 }}>
                      Une erreur est survenue. Consulte les logs.
                    </span>
                  )}
                </>
              )}

              {status === 'launching' && (
                <>
                  <div className="play-btn-launching">
                    <span className="launch-gear">⚙</span>
                    Lancement...
                  </div>
                  <ProgressBar progress={progress} />
                  <div className="launching-text">Préparation de Minecraft en cours</div>
                  <div className="launching-tip">{LOADING_TIPS[currentTip]}</div>
                </>
              )}

              {status === 'playing' && (
                <div className="playing-badge">✓ Minecraft est en cours</div>
              )}
            </div>

            {/* Footer */}
            <div className="home-footer">
              <div className="footer-left">
                <button className="footer-btn" onClick={() => setShowLogs(!showLogs)}>
                  {showLogs ? '▲ Masquer logs' : '▼ Logs'}
                </button>
                {showLogs && logs.length > 0 && (
                  <button className="footer-btn" onClick={handleCopyLogs}>
                    {logsCopied ? '✓ Copié' : 'Copier'}
                  </button>
                )}
              </div>
              <div className="footer-right">
                {status === 'idle' && modsStatus === 'idle' && (
                  <button className="footer-btn" onClick={handleRepairMods} title="Re-télécharger tous les mods">
                    ↻ Réparer
                  </button>
                )}
                <button className="footer-btn" onClick={() => window.launcher.openGameDir()} title="Ouvrir le dossier de jeu">
                  ⊞ Dossier
                </button>
                <button className="footer-btn" onClick={() => setShowModList(true)} title="Liste des mods installés">
                  ☰ Mods
                </button>
                <button className="footer-btn" onClick={() => setShowWelcome(true)} title="Guide de démarrage">
                  ? Guide
                </button>
                {profile?.name === ADMIN_USERNAME && (
                  <button className="footer-btn" onClick={onModLibrary} title="Bibliothèque de mods (admin)">
                    ⚙ Admin
                  </button>
                )}
                <button className="footer-btn" onClick={onSettings}>Paramètres</button>
              </div>
            </div>

            {showLogs && (
              <>
                <div className="console-toggle-row" onClick={() => setShowLogs(false)}>
                  ▼ Console — {logs.length} lignes
                </div>
                <ConsoleLog logs={logs} />
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
