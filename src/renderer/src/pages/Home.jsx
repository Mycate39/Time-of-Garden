import { useState, useEffect, useRef } from 'react'
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

export default function Home({ profile, onSettings, onModLibrary, onLogout }) {
  const [splashText] = useState(() => SPLASH_TEXTS[Math.floor(Math.random() * SPLASH_TEXTS.length)])
  const [status, setStatus] = useState('idle') // 'idle' | 'launching' | 'playing' | 'error'
  const [progress, setProgress] = useState(null)
  const [logs, setLogs] = useState([])
  const [showLogs, setShowLogs] = useState(false)
  const [logsCopied, setLogsCopied] = useState(false)
  const [settings, setSettings] = useState(null)

  // Mods update state
  const [modsUpdate, setModsUpdate] = useState(null) // null | { version, count, remoteManifest }
  const [modsStatus, setModsStatus] = useState('idle') // 'idle' | 'checking' | 'downloading' | 'done'
  const [modsProgress, setModsProgress] = useState(null) // { current, total, filename }

  // Launcher auto-update state
  const [launcherUpdate, setLauncherUpdate] = useState(null) // null | { version }
  const [launcherUpdateProgress, setLauncherUpdateProgress] = useState(null) // 0-100
  const [launcherUpdateReady, setLauncherUpdateReady] = useState(false)

  // Server status
  const [serverOnline, setServerOnline] = useState(null) // null | true | false
  const serverPingRef = useRef(null)

  // Bot keepalive (admin)
  const [botStatus, setBotStatus] = useState('stopped') // 'stopped' | 'connecting' | 'online' | 'reconnecting'

  const checkServerStatus = async () => {
    try {
      const result = await window.launcher.serverStatus()
      setServerOnline(result.online)
    } catch {
      setServerOnline(false)
    }
  }

  useEffect(() => {
    window.launcher.getSettings().then((s) => {
      setSettings(s)
    })

    window.launcher.onProgress((_, e) => {
      setProgress(e)
    })

    window.launcher.onLog((_, msg) => {
      setLogs((prev) => [...prev.slice(-200), msg])
    })

    window.launcher.onGameClose((_, code) => {
      setStatus('idle')
      setProgress(null)
      setLogs((prev) => [...prev, `[Launcher] Jeu fermé (code ${code})`])
      // Re-vérifie les mods quand le jeu se ferme
      checkModsUpdate()
    })

    window.launcher.onModsProgress((_, p) => {
      setModsProgress(p)
    })

    window.launcher.onUpdateAvailable((_, info) => setLauncherUpdate(info))
    window.launcher.onUpdateProgress((_, pct) => setLauncherUpdateProgress(pct))
    window.launcher.onUpdateReady(() => setLauncherUpdateReady(true))

    // Statut bot au chargement
    window.launcher.getBotStatus().then(({ status }) => setBotStatus(status))
    window.launcher.onBotStatus((_, { status }) => setBotStatus(status))

    // Vérification des mods au démarrage
    checkModsUpdate()

    // Vérification du statut serveur au démarrage + toutes les 30 secondes
    checkServerStatus()
    serverPingRef.current = setInterval(checkServerStatus, 30000)

    return () => {
      if (serverPingRef.current) clearInterval(serverPingRef.current)
    }
  }, [])

  const checkModsUpdate = async () => {
    setModsStatus('checking')
    try {
      const result = await window.launcher.checkMods()
      if (result.hasUpdate && !result.error) {
        setModsUpdate({
          version: result.version,
          count: result.count,
          remoteManifest: result.remoteManifest
        })
      }
    } catch {}
    setModsStatus('idle')
  }

  const handleInstallMods = async () => {
    setModsStatus('downloading')
    setModsProgress(null)
    try {
      await window.launcher.applyMods(modsUpdate.remoteManifest)
      setModsStatus('done')
      setModsUpdate(null)
    } catch {
      setModsStatus('idle')
    }
  }

  const handleSkipMods = () => {
    setModsUpdate(null)
    setModsStatus('idle')
  }

  const handleCopyLogs = () => {
    navigator.clipboard.writeText(logs.join('\n'))
    setLogsCopied(true)
    setTimeout(() => setLogsCopied(false), 2000)
  }

  const handleToggleBot = async () => {
    if (botStatus === 'stopped') {
      await window.launcher.startBot()
    } else {
      await window.launcher.stopBot()
    }
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
      setLogs((prev) => [...prev, `[Erreur] ${e.message}`])
    }
  }

  const serverDescription = settings?.serverDescription || ''

  return (
    <>
      <Titlebar />
      <div className="home-page">
        <div className="home-content">
          {/* Panneau gauche */}
          <aside className="home-sidebar">
            <img src={logo} alt="Time of Garden" className="server-logo" />
            <div className="server-name">Time of Garden</div>
            <div className="server-version">Forge 1.20.1</div>
            <div className="splash-text">{splashText}</div>
          </aside>

          {/* Panneau principal */}
          <div className="home-main">
            {/* Infos joueur */}
            <div className="player-card">
              <div className="player-avatar">
                {profile?.name
                  ? <img
                      src={`https://mc-heads.net/avatar/${profile.name}/64`}
                      alt="skin"
                      className="player-skin-img"
                      onError={e => { e.currentTarget.style.display = 'none' }}
                    />
                  : '👤'
                }
              </div>
              <div className="player-info">
                <div className="player-name">{profile?.name ?? '???'}</div>
                <div className="player-label">Compte Minecraft</div>
              </div>
            </div>

            {/* Statut serveur */}
            <div className="server-status-bar">
              <span
                className={`server-dot ${serverOnline === true ? 'online' : serverOnline === false ? 'offline' : 'unknown'}`}
              />
              <span className="server-status-label">
                {serverOnline === true ? 'Serveur en ligne' : serverOnline === false ? 'Serveur hors ligne' : 'Vérification...'}
              </span>
              {serverDescription && (
                <span className="server-description">{serverDescription}</span>
              )}
            </div>

            {/* Bannière mise à jour mods */}
            {modsStatus === 'checking' && (
              <div className="mods-banner">
                <span>🔍 Vérification des mods...</span>
              </div>
            )}

            {modsUpdate && modsStatus === 'idle' && (
              <div className="mods-banner update">
                <div className="mods-banner-info">
                  <strong>📦 Mise à jour des mods disponible</strong>
                  <span>Version {modsUpdate.version} — {modsUpdate.count} mod(s)</span>
                </div>
                <div className="mods-banner-actions">
                  <button className="btn-primary" onClick={handleInstallMods}>
                    Installer
                  </button>
                  <button className="footer-btn" onClick={handleSkipMods}>
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
                    <span>
                      {modsProgress.current}/{modsProgress.total} — {modsProgress.filename}
                    </span>
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
                <button className="footer-btn" onClick={() => setModsStatus('idle')}>
                  OK
                </button>
              </div>
            )}

            {/* Bannière mise à jour launcher */}
            {launcherUpdate && !launcherUpdateReady && (
              <div className="mods-banner downloading">
                <div className="mods-banner-info">
                  <strong>⬇ Mise à jour du launcher {launcherUpdate.version}...</strong>
                  {launcherUpdateProgress !== null && (
                    <span>{launcherUpdateProgress}%</span>
                  )}
                </div>
                <div className="mods-progress-track">
                  <div
                    className="mods-progress-fill"
                    style={{ width: launcherUpdateProgress !== null ? `${launcherUpdateProgress}%` : '5%' }}
                  />
                </div>
              </div>
            )}

            {launcherUpdateReady && (
              <div className="mods-banner success">
                <span>✓ Mise à jour prête !</span>
                <button className="btn-primary" onClick={() => window.launcher.installUpdate()}>
                  Redémarrer
                </button>
              </div>
            )}

            {/* Section lancement */}
            <div className="launch-section">
              {(status === 'idle' || status === 'error') && (
                <>
                  <button className="play-btn" onClick={handlePlay}>
                    JOUER
                  </button>
                  {status === 'error' && (
                    <span style={{ color: 'var(--red)', fontSize: 13 }}>
                      Une erreur est survenue. Consulte les logs.
                    </span>
                  )}
                </>
              )}

              {status === 'launching' && (
                <>
                  <ProgressBar progress={progress} />
                  <p className="launching-text">Lancement en cours...</p>
                </>
              )}

              {status === 'playing' && (
                <div className="playing-badge">Jeu en cours...</div>
              )}
            </div>

            {/* Pied de page */}
            <div className="home-footer">
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="footer-btn" onClick={() => setShowLogs(!showLogs)}>
                  {showLogs ? 'Masquer logs' : 'Afficher logs'}
                </button>
                {showLogs && logs.length > 0 && (
                  <button className="footer-btn" onClick={handleCopyLogs}>
                    {logsCopied ? '✓ Copié' : 'Copier logs'}
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {profile?.name === ADMIN_USERNAME && (
                  <>
                    <button className="footer-btn" onClick={onModLibrary} title="Bibliothèque de mods (admin)">
                      📚
                    </button>
                    <button
                      className={`footer-btn bot-btn ${botStatus}`}
                      onClick={handleToggleBot}
                      title={`Bot keepalive : ${botStatus}`}
                      disabled={botStatus === 'connecting' || botStatus === 'reconnecting'}
                    >
                      🤖 {botStatus === 'stopped' ? 'Bot OFF' : botStatus === 'online' ? 'Bot ON' : '...'}
                    </button>
                  </>
                )}
                <button className="footer-btn" onClick={onSettings}>⚙ Paramètres</button>
                <button className="footer-btn danger" onClick={onLogout}>Déconnexion</button>
              </div>
            </div>

            {showLogs && <ConsoleLog logs={logs} />}
          </div>
        </div>
      </div>
    </>
  )
}
