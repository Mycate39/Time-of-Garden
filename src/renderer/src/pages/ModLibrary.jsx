import { useState, useEffect, useRef } from 'react'
import Titlebar from '../components/Titlebar'

function getSideBadge(hit) {
  if (hit.source !== 'modrinth') return null
  const c = hit.client_side
  const s = hit.server_side
  if (!c || !s) return null
  if (c === 'required' && s === 'unsupported') return { label: 'Client', color: '#3b9eff' }
  if (c === 'optional' && s === 'unsupported') return { label: 'Client', color: '#3b9eff' }
  if (s === 'required' && c === 'unsupported') return { label: 'Serveur', color: '#ff7b3b' }
  if (s === 'optional' && c === 'unsupported') return { label: 'Serveur', color: '#ff7b3b' }
  return { label: 'Client + Serveur', color: '#9b3bff' }
}

export default function ModLibrary({ onBack }) {
  const [tab, setTab] = useState('modrinth') // 'modrinth' | 'curseforge' | 'installed'
  const source = tab === 'installed' ? 'modrinth' : tab

  // --- Recherche / suggestions ---
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [suggestions, setSuggestions] = useState([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const [loading, setLoading] = useState(false)
  const [addStatus, setAddStatus] = useState({})
  const queueRef = useRef([])       // [{ projectId, src }, ...]
  const processingRef = useRef(false)
  const currentIdRef = useRef(null) // mod en cours pour les events de progress

  // --- Mods installés ---
  const [installedMods, setInstalledMods] = useState([])
  const [installedMap, setInstalledMap] = useState({}) // { projectId: filename }
  const [loadingInstalled, setLoadingInstalled] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [deleteStatus, setDeleteStatus] = useState({})

  // --- Import local ---
  const [importing, setImporting] = useState(false)
  const [importStatus, setImportStatus] = useState(null) // null | { filenames: [] } | 'error'

  useEffect(() => {
    window.launcher.onAddProgress((_, progress) => {
      if (currentIdRef.current) {
        setAddStatus(prev => ({ ...prev, [currentIdRef.current]: progress }))
      }
    })
    window.launcher.getInstalledMap().then(map => setInstalledMap(map ?? {}))
  }, [])

  // Chargement selon l'onglet actif
  useEffect(() => {
    setResults([])
    setQuery('')
    setAddStatus({})

    if (tab === 'installed') {
      setDeleteStatus({})
      refreshInstalledMods()
    } else {
      setSuggestions([])
      setLoadingSuggestions(true)
      window.launcher.getSuggestions(tab)
        .then(data => setSuggestions(data ?? []))
        .catch(() => setSuggestions([]))
        .finally(() => setLoadingSuggestions(false))
    }
  }, [tab])

  const refreshInstalledMods = () => {
    setLoadingInstalled(true)
    window.launcher.listMods()
      .then(data => setInstalledMods(data ?? []))
      .catch(() => setInstalledMods([]))
      .finally(() => setLoadingInstalled(false))
  }

  // Recherche automatique avec debounce 400ms
  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      return
    }
    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        const hits = await window.launcher.searchMods(query.trim(), source)
        setResults(hits)
      } catch {
        setResults([])
      }
      setLoading(false)
    }, 400)
    return () => clearTimeout(timer)
  }, [query, source])

  const processQueue = async () => {
    if (processingRef.current) return
    processingRef.current = true
    while (queueRef.current.length > 0) {
      const { projectId, src } = queueRef.current.shift()
      currentIdRef.current = projectId
      try {
        const result = await window.launcher.addMod(projectId, src)
        const { filename, deps } = result
        setAddStatus(prev => ({ ...prev, [projectId]: { step: 'done', filename, deps } }))
        setInstalledMap(prev => ({ ...prev, [projectId]: filename }))
      } catch (e) {
        setAddStatus(prev => ({ ...prev, [projectId]: { step: 'error', message: e.message } }))
      }
      currentIdRef.current = null
    }
    processingRef.current = false
  }

  const handleAdd = (hit) => {
    const s = addStatus[hit.project_id]
    if (isInstalled(hit) || (s && ['queued', 'download', 'upload', 'done', 'start'].includes(s.step))) return
    queueRef.current.push({ projectId: hit.project_id, src: source })
    setAddStatus(prev => ({ ...prev, [hit.project_id]: { step: 'queued' } }))
    processQueue()
  }

  const handleDelete = async (filename) => {
    setDeleting(filename)
    try {
      await window.launcher.deleteMod(filename)
      setDeleteStatus(prev => ({ ...prev, [filename]: 'done' }))
      setInstalledMods(prev => prev.filter(m => m.filename !== filename))
      // Retire de la map locale
      setInstalledMap(prev => {
        const next = { ...prev }
        for (const [k, v] of Object.entries(next)) { if (v === filename) delete next[k] }
        return next
      })
    } catch {
      setDeleteStatus(prev => ({ ...prev, [filename]: 'error' }))
    }
    setDeleting(null)
  }

  const handleImport = async () => {
    setImporting(true)
    setImportStatus(null)
    try {
      const filenames = await window.launcher.importLocalMod()
      if (filenames.length > 0) {
        setImportStatus({ filenames })
        setInstalledMap(prev => {
          const next = { ...prev }
          filenames.forEach(fn => { next[`local:${fn}`] = fn })
          return next
        })
      }
    } catch {
      setImportStatus('error')
    }
    setImporting(false)
  }

  const isInstalled = (hit) => {
    return hit.project_id in installedMap
  }

  const getButtonLabel = (hit) => {
    if (isInstalled(hit) && !addStatus[hit.project_id]) return '✓ Installé'
    const s = addStatus[hit.project_id]
    if (!s) return '+ Ajouter'
    if (s.step === 'queued') return '⏳ En attente'
    if (s.step === 'download') return '⬇ Téléchargement...'
    if (s.step === 'upload') return '⬆ Upload GitHub...'
    if (s.step === 'done') return '✓ Ajouté !'
    if (s.step === 'error') return '✗ Erreur'
    return '...'
  }

  const isDisabled = (hit) => {
    if (isInstalled(hit)) return true
    const s = addStatus[hit.project_id]
    return s && ['queued', 'done', 'download', 'upload', 'start'].includes(s.step)
  }

  const displayList = query.trim() ? results : suggestions
  const showingSearch = !!query.trim()

  return (
    <>
      <Titlebar />
      <div className="settings-page">
        <div className="settings-header">
          <button className="back-btn" onClick={onBack}>← Retour</button>
          <h2>📚 Bibliothèque de mods</h2>
        </div>

        <div className="settings-body">
          {/* Onglets */}
          <div className="source-tabs">
            <button className={`source-tab${tab === 'modrinth' ? ' active' : ''}`} onClick={() => setTab('modrinth')}>
              Modrinth
            </button>
            <button className={`source-tab${tab === 'curseforge' ? ' active' : ''}`} onClick={() => setTab('curseforge')}>
              CurseForge
            </button>
            <button className={`source-tab${tab === 'installed' ? ' active' : ''}`} onClick={() => setTab('installed')}>
              Installés
            </button>
          </div>

          {/* ===== Onglet Installés ===== */}
          {tab === 'installed' && (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                  Mods présents sur le repo GitHub.
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="footer-btn"
                    onClick={handleImport}
                    disabled={importing}
                    title="Importer un .jar depuis votre ordinateur"
                  >
                    {importing ? '⬆ Upload...' : '📁 Importer'}
                  </button>
                  <button className="footer-btn" onClick={refreshInstalledMods} disabled={loadingInstalled}>
                    {loadingInstalled ? '...' : '↻ Actualiser'}
                  </button>
                </div>
              </div>

              {importStatus && importStatus !== 'error' && (
                <p style={{ color: 'var(--green)', fontSize: 12, marginBottom: 8 }}>
                  ✓ {importStatus.filenames.join(', ')} importé(s) avec succès.
                </p>
              )}
              {importStatus === 'error' && (
                <p style={{ color: 'var(--red)', fontSize: 12, marginBottom: 8 }}>Erreur lors de l'import.</p>
              )}

              {loadingInstalled && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Chargement...</p>}
              {!loadingInstalled && installedMods.length === 0 && (
                <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Aucun mod installé.</p>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {installedMods.map(mod => (
                  <div key={mod.filename} className="mod-result-row">
                    <div className="mod-icon"><span>🧩</span></div>
                    <div className="mod-result-info">
                      <strong>{mod.filename}</strong>
                      {deleteStatus[mod.filename] === 'error' && (
                        <span style={{ color: 'var(--red)', fontSize: 12 }}>Erreur lors de la suppression</span>
                      )}
                    </div>
                    <button
                      className="btn-danger"
                      onClick={() => handleDelete(mod.filename)}
                      disabled={!!deleting}
                      style={{ flexShrink: 0, fontSize: 12, padding: '6px 12px' }}
                    >
                      {deleting === mod.filename ? '...' : '🗑 Supprimer'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ===== Onglets Modrinth / CurseForge ===== */}
          {tab !== 'installed' && (
            <>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <input
                  className="setting-input"
                  type="text"
                  placeholder={`Rechercher sur ${tab === 'modrinth' ? 'Modrinth' : 'CurseForge'} (Forge 1.20.1)...`}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  style={{ flex: 1 }}
                  autoFocus
                />
                {loading && <span style={{ alignSelf: 'center', color: 'var(--text-muted)', fontSize: 13 }}>...</span>}
              </div>

              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                Les mods sont uploadés sur GitHub → mis à jour automatiquement pour tous les joueurs.
              </p>

              {!showingSearch && (
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 14, marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
                  {loadingSuggestions ? 'Chargement...' : '⭐ Mods populaires'}
                </p>
              )}

              {showingSearch && results.length === 0 && !loading && (
                <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 16 }}>Aucun résultat.</p>
              )}

              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {displayList.map(hit => {
                  const sideBadge = getSideBadge(hit)
                  const installed = isInstalled(hit)
                  return (
                    <div key={hit.project_id} className="mod-result-row">
                      <div className="mod-icon">
                        {hit.icon_url
                          ? <img src={hit.icon_url} alt="" draggable={false} />
                          : <span>🧩</span>
                        }
                      </div>
                      <div className="mod-result-info">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <strong>{hit.title}</strong>
                          {sideBadge && (
                            <span className="mod-badge" style={{ background: sideBadge.color }}>
                              {sideBadge.label}
                            </span>
                          )}
                          {installed && (
                            <span className="mod-badge" style={{ background: 'var(--green)', color: '#000' }}>
                              ✓ Installé
                            </span>
                          )}
                        </div>
                        <span>{hit.description}</span>
                        {addStatus[hit.project_id]?.step === 'error' && (
                          <span style={{ color: 'var(--red)', fontSize: 12 }}>
                            {addStatus[hit.project_id].message}
                          </span>
                        )}
                        {addStatus[hit.project_id]?.step === 'done' && (
                          <span style={{ color: 'var(--green)', fontSize: 12 }}>
                            {addStatus[hit.project_id].filename} uploadé !
                            {addStatus[hit.project_id].deps?.length > 0 && (
                              <> + {addStatus[hit.project_id].deps.length} dépendance(s) installée(s)</>
                            )}
                          </span>
                        )}
                      </div>
                      <button
                        className={`btn-primary${(installed || addStatus[hit.project_id]?.step === 'done') ? ' success' : ''}`}
                        onClick={() => handleAdd(hit)}
                        disabled={isDisabled(hit)}
                        style={{ flexShrink: 0, fontSize: 12, padding: '6px 12px' }}
                      >
                        {getButtonLabel(hit)}
                      </button>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
