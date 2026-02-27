import { useState } from 'react'
import Titlebar from '../components/Titlebar'
import logo from '../assets/logo.png'

export default function Login({ onLogin }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleLogin = async () => {
    setLoading(true)
    setError(null)
    try {
      const profile = await window.launcher.login()
      onLogin(profile)
    } catch {
      setError('Connexion annulée ou échouée. Réessaie.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Titlebar />
      <div className="login-page">
        {/* Background gears */}
        <div className="login-gear-1">⚙</div>
        <div className="login-gear-2">⚙</div>
        <div className="login-gear-3">⚙</div>
        <div className="login-gear-4">⚙</div>

        {/* Steam */}
        <div className="login-steam">
          <div className="steam-p" />
          <div className="steam-p" />
          <div className="steam-p" />
          <div className="steam-p" />
        </div>

        <div className="login-content">
          {/* Logo with gear rings */}
          <div className="login-logo-wrap">
            <div className="login-gear-ring-outer">⚙</div>
            <div className="login-gear-ring-inner">⚙</div>
            <img src={logo} alt="Time of Garden" className="login-logo" />
          </div>

          {/* Title */}
          <div className="login-title-block">
            <div className="login-title">Time of Garden</div>
            <div className="login-subtitle">Connecte-toi pour accéder au serveur</div>
          </div>

          {/* Login button */}
          <button className="login-btn" onClick={handleLogin} disabled={loading}>
            {loading ? (
              <>
                <div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
                Connexion en cours...
              </>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 21 21" fill="currentColor">
                  <path d="M10.5 0C4.7 0 0 4.7 0 10.5S4.7 21 10.5 21 21 16.3 21 10.5 16.3 0 10.5 0zm0 3.2c2 0 3.8.7 5.2 1.9l-8.5 8.5A7.23 7.23 0 013.2 10.5c0-4 3.3-7.3 7.3-7.3zm0 14.6c-2 0-3.8-.7-5.2-1.9l8.5-8.5a7.23 7.23 0 012 5.1c0 4-3.3 7.3-7.3 7.3z"/>
                </svg>
                Se connecter avec Microsoft
              </>
            )}
          </button>

          {error && <div className="login-error">{error}</div>}
        </div>
      </div>
    </>
  )
}
