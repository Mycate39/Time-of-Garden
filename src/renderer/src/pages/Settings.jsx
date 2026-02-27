import { useState, useEffect } from 'react'
import Titlebar from '../components/Titlebar'

export default function Settings({ onBack }) {
  const [settings, setSettings] = useState({
    ramMin: 2,
    ramMax: 4,
    javaPath: 'java',
    githubToken: '',
    serverDescription: ''
  })
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    window.launcher.getSettings().then(setSettings)
  }, [])

  const handleChange = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
    setSaved(false)
  }

  const handleSave = async () => {
    await window.launcher.setSettings(settings)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <>
      <Titlebar />
      <div className="settings-page">
        <div className="settings-header">
          <button className="back-btn" onClick={onBack}>← Retour</button>
          <h2>Paramètres</h2>
        </div>

        <div className="settings-body">
          {/* Serveur */}
          <div className="settings-group">
            <h3>Serveur</h3>
            <div className="setting-row">
              <label className="setting-label">Description du serveur (affiché sur l'accueil)</label>
              <textarea
                className="setting-input"
                rows={3}
                placeholder="Une courte description de votre serveur..."
                value={settings.serverDescription}
                onChange={(e) => handleChange('serverDescription', e.target.value)}
                style={{ resize: 'vertical', fontFamily: 'inherit' }}
              />
            </div>
          </div>

          {/* Mémoire */}
          <div className="settings-group">
            <h3>Mémoire RAM</h3>
            <div className="setting-row">
              <label className="setting-label">
                RAM minimum <span>{settings.ramMin} Go</span>
              </label>
              <input
                className="setting-range"
                type="range"
                min={1}
                max={8}
                step={1}
                value={settings.ramMin}
                onChange={(e) => handleChange('ramMin', Number(e.target.value))}
              />
            </div>
            <div className="setting-row">
              <label className="setting-label">
                RAM maximum <span>{settings.ramMax} Go</span>
              </label>
              <input
                className="setting-range"
                type="range"
                min={2}
                max={16}
                step={1}
                value={settings.ramMax}
                onChange={(e) => handleChange('ramMax', Number(e.target.value))}
              />
            </div>
          </div>

          {/* GitHub Token (admin) */}
          <div className="settings-group">
            <h3>Admin — GitHub Token</h3>
            <div className="setting-row">
              <label className="setting-label">Token GitHub (pour upload de mods)</label>
              <input
                className="setting-input"
                type="password"
                placeholder="ghp_..."
                value={settings.githubToken}
                onChange={(e) => handleChange('githubToken', e.target.value)}
              />
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              Nécessaire uniquement pour l'admin. Jamais envoyé en dehors de cette app.
            </p>
          </div>

          {/* Java */}
          <div className="settings-group">
            <h3>Java</h3>
            <div className="setting-row">
              <label className="setting-label">
                Chemin vers Java 17 (laisse "java" pour utiliser le Java du système)
              </label>
              <input
                className="setting-input"
                type="text"
                placeholder='ex Windows : C:\Program Files\Java\jdk-17\bin\java.exe  |  ex macOS : /usr/local/opt/openjdk@17/bin/java'
                value={settings.javaPath}
                onChange={(e) => handleChange('javaPath', e.target.value)}
              />
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              Minecraft 1.20.1 avec Forge nécessite Java 17 ou supérieur.
            </p>
          </div>

          <div className="settings-actions">
            <button className="btn-primary" onClick={handleSave}>
              {saved ? '✓ Sauvegardé' : 'Sauvegarder'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
