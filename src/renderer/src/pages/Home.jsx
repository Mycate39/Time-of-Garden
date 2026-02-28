import { useState, useEffect, useRef, useCallback } from 'react'
import Titlebar from '../components/Titlebar'
import ProgressBar from '../components/ProgressBar'
import ConsoleLog from '../components/ConsoleLog'
import logo from '../assets/logo.png'

const ADMIN_USERNAME = 'Mycate39'

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
  const [settings, setSettings] = useState(null)

  // Mods update
  const [modsUpdate, setModsUpdate] = useState(null)
  const [modsStatus, setModsStatus] = useState('idle')
  const [modsProgress, setModsProgress] = useState(null)

  // Launcher auto-update — modal flow
  const [updateModal, setUpdateModal] = useState(null)   // null | { version }
  const [updateDlPct, setUpdateDlPct] = useState(null)  // null | 0-100
  const [updateReady, setUpdateReady] = useState(false)

  // Server status
  const [serverOnline, setServerOnline] = useState(null)
  const serverPingRef = useRef(null)

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

  const checkServerStatus = async () => {
    try {
      const result = await window.launcher.serverStatus()
      setServerOnline(result.online)
    } catch {
      setServerOnline(false)
    }
  }

  useEffect(() => {
    window.launcher.getSettings().then(setSettings)

    window.launcher.onProgress((_, e) => setProgress(e))

    window.launcher.onLog((_, msg) => {
      setLogs(prev => [...prev.slice(-200), msg])
    })

    window.launcher.onGameClose((_, code) => {
      setStatus('idle')
      setProgress(null)
      setLogs(prev => [...prev, `[Launcher] Jeu fermé (code ${code})`])
      checkModsUpdate()
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
    checkServerStatus()
    serverPingRef.current = setInterval(checkServerStatus, 30000)

    return () => { if (serverPingRef.current) clearInterval(serverPingRef.current) }
  }, [])

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
      if (result.hasUpdate && !result.error) {
        const update = { version: result.version, count: result.count, remoteManifest: result.remoteManifest }
        if (result.autoUpdate) {
          await handleInstallMods(update)
          return
        }
        setModsUpdate(update)
      }
    } catch {}
    setModsStatus('idle')
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

  const serverDescription = settings?.serverDescription || ''
  const isDownloading = updateDlPct !== null && !updateReady

  return (
    <>
      <Titlebar />

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

            {/* Server status */}
            <div className="server-status-bar">
              <div className="server-status-row">
                <span className={`server-dot ${serverOnline === true ? 'online' : serverOnline === false ? 'offline' : 'unknown'}`} />
                <span className="server-status-label">
                  {serverOnline === true ? 'Serveur en ligne' : serverOnline === false ? 'Hors ligne' : 'Vérification...'}
                </span>
              </div>
              {serverDescription ? (
                <div className="server-description">{serverDescription}</div>
              ) : null}
            </div>
          </aside>

          {/* ── Main panel ── */}
          <div className="home-main">
            <div className="main-bg-gear">⚙</div>

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
                {profile?.name === ADMIN_USERNAME && (
                  <button className="footer-btn" onClick={onModLibrary} title="Bibliothèque de mods (admin)">
                    ⚙ Mods
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
