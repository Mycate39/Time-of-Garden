import { useState, useEffect } from 'react'
import Titlebar from '../components/Titlebar'

const ADMIN_USERNAME = 'Mycate39'

export default function Settings({ onBack, profile }) {
  const [settings, setSettings] = useState({
    ram: 4,
    autoUpdateMods: false,
    minimizeOnLaunch: true,
    javaPath: 'java',
    githubToken: '',
    news: ''
  })
  const [detectingJava, setDetectingJava] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => { window.launcher.getSettings().then(setSettings) }, [])

  const handleChange = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }))
    setSaved(false)
  }

  const handleDetectJava = async () => {
    setDetectingJava(true)
    const found = await window.launcher.detectJava()
    if (found) handleChange('javaPath', found)
    setDetectingJava(false)
  }

  const handleSave = async () => {
    await window.launcher.setSettings(settings)
    if (profile?.name === ADMIN_USERNAME) {
      await window.launcher.setAutoUpdate()
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <>
      <Titlebar />
      <div className="settings-page">
        <div className="settings-header">
          <button className="back-btn" onClick={onBack}>← Retour</button>
          <h2>⚙ Paramètres</h2>
        </div>

        <div className="settings-body">

          {/* Mods — admin uniquement */}
          {profile?.name === ADMIN_USERNAME && (
            <div className="settings-group">
              <h3>Mods</h3>
              <div className="setting-row setting-row-toggle">
                <div>
                  <div className="setting-label">Mise à jour automatique des mods</div>
                  <div className="setting-hint">Installe les mises à jour de mods au démarrage sans confirmation</div>
                </div>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={!!settings.autoUpdateMods}
                    onChange={e => handleChange('autoUpdateMods', e.target.checked)}
                  />
                  <span className="toggle-track"><span className="toggle-thumb" /></span>
                </label>
              </div>
            </div>
          )}

          {/* Lancement */}
          <div className="settings-group">
            <h3>Lancement</h3>
            <div className="setting-row setting-row-toggle">
              <div>
                <div className="setting-label">Minimiser au lancement du jeu</div>
                <div className="setting-hint">Le launcher se minimise automatiquement quand Minecraft démarre</div>
              </div>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={!!settings.minimizeOnLaunch}
                  onChange={e => handleChange('minimizeOnLaunch', e.target.checked)}
                />
                <span className="toggle-track"><span className="toggle-thumb" /></span>
              </label>
            </div>
          </div>

          {/* Mémoire */}
          <div className="settings-group">
            <h3>Mémoire RAM</h3>
            <div className="setting-row">
              <label className="setting-label">
                RAM allouée <span>{settings.ram} Go</span>
              </label>
              <input
                className="setting-range" type="range"
                min={2} max={16} step={1}
                value={settings.ram}
                onChange={e => handleChange('ram', Number(e.target.value))}
              />
            </div>
          </div>

          {/* Admin */}
          <div className="settings-group">
            <h3>Admin — GitHub Token</h3>
            <div className="setting-row">
              <label className="setting-label">Token GitHub (pour upload de mods)</label>
              <input
                className="setting-input" type="password"
                placeholder="ghp_..."
                value={settings.githubToken}
                onChange={e => handleChange('githubToken', e.target.value)}
              />
            </div>
            <div className="setting-row">
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                Nécessaire uniquement pour l'admin. Jamais envoyé en dehors de cette app.
              </span>
            </div>
          </div>

          {/* Java */}
          <div className="settings-group">
            <h3>Java</h3>
            <div className="setting-row">
              <label className="setting-label">
                Chemin vers Java 17 (laisse "java" pour le Java système)
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="setting-input" type="text"
                  style={{ flex: 1 }}
                  placeholder='ex: /usr/local/opt/openjdk@17/bin/java'
                  value={settings.javaPath}
                  onChange={e => handleChange('javaPath', e.target.value)}
                />
                <button
                  className="btn-ghost"
                  onClick={handleDetectJava}
                  disabled={detectingJava}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  {detectingJava ? '⚙ Détection...' : '⊕ Détecter'}
                </button>
              </div>
            </div>
            <div className="setting-row">
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                Minecraft 1.20.1 avec Forge nécessite Java 17 ou supérieur.
              </span>
            </div>
          </div>

          {/* Nouveautés — admin uniquement */}
          {profile?.name === ADMIN_USERNAME && (
            <div className="settings-group">
              <h3>Nouveautés</h3>
              <div className="setting-row">
                <label className="setting-label">Message affiché aux joueurs au démarrage (laisser vide pour désactiver)</label>
                <textarea
                  className="setting-input"
                  rows={3}
                  placeholder="Ex : Nouvelle map disponible ! Connectez-vous pour la découvrir."
                  value={settings.news ?? ''}
                  onChange={e => handleChange('news', e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="settings-actions">
            {saved && (
              <span style={{ color: 'var(--green-bright)', fontSize: 14, fontWeight: 600 }}>
                ✓ Sauvegardé
              </span>
            )}
            <button className="btn-primary" onClick={handleSave}>Sauvegarder</button>
          </div>
        </div>
      </div>
    </>
  )
}
