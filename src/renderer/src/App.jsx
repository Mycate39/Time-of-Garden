import { useState, useEffect } from 'react'
import Login from './pages/Login'
import Home from './pages/Home'
import Settings from './pages/Settings'
import ModLibrary from './pages/ModLibrary'

export default function App() {
  const [page, setPage] = useState('loading')
  const [profile, setProfile] = useState(null)

  useEffect(() => {
    window.launcher.getProfile().then((p) => {
      if (p) {
        setProfile(p)
        setPage('home')
      } else {
        setPage('login')
      }
    })
  }, [])

  const handleLogin = (p) => {
    setProfile(p)
    setPage('home')
  }

  const handleLogout = async () => {
    await window.launcher.logout()
    setProfile(null)
    setPage('login')
  }

  const handleSwitchAccount = (newProfile) => {
    setProfile(newProfile)
  }

  if (page === 'loading') {
    return (
      <div className="loading-screen">
        <div className="spinner" />
      </div>
    )
  }

  if (page === 'login') return <Login onLogin={handleLogin} />
  if (page === 'settings') return <Settings onBack={() => setPage('home')} />
  if (page === 'modlibrary') return <ModLibrary onBack={() => setPage('home')} />
  return (
    <Home
      profile={profile}
      onSettings={() => setPage('settings')}
      onModLibrary={() => setPage('modlibrary')}
      onLogout={handleLogout}
      onSwitchAccount={handleSwitchAccount}
    />
  )
}
