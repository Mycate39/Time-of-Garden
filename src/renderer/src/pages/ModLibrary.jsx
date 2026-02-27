import { useState, useEffect, useRef } from 'react'
import Titlebar from '../components/Titlebar'

function getSideBadge(mod) {
  const c = mod.client_side
  const s = mod.server_side
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
  const queueRef = useRef([])       // [{ projectId, src, meta }, ...]
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

  // --- Vérification nouvelles versions ---
  const [checkingUpdates, setCheckingUpdates] = useState(false)
  const [modUpdates, setModUpdates] = useState([]) // [{ projectId, source, currentFilename, newFilename, newUrl }]
  const [updatingMod, setUpdatingMod] = useState(null) // projectId en cours
  const [updateStatus, setUpdateStatus] = useState({}) // { [projectId]: 'updating'|'done'|'error' }

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

  const handleCheckUpdates = async () => {
    setCheckingUpdates(true)
    setModUpdates([])
    setUpdateStatus({})
    try {
      const updates = await window.launcher.checkModUpdates()
      setModUpdates(updates ?? [])
    } catch {}
    setCheckingUpdates(false)
  }

  const handleApplyUpdate = async (update) => {
    setUpdatingMod(update.projectId)
    setUpdateStatus(prev => ({ ...prev, [update.projectId]: 'updating' }))
    try {
      await window.launcher.applyModUpdate(update)
      setUpdateStatus(prev => ({ ...prev, [update.projectId]: 'done' }))
      setInstalledMods(prev => prev.map(m =>
        m.filename === update.currentFilename ? { ...m, filename: update.newFilename } : m
      ))
      setModUpdates(prev => prev.filter(u => u.projectId !== update.projectId))
    } catch {
      setUpdateStatus(prev => ({ ...prev, [update.projectId]: 'error' }))
    }
    setUpdatingMod(null)
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
      const { projectId, src, meta } = queueRef.current.shift()
      currentIdRef.current = projectId
      try {
        const result = await window.launcher.addMod(projectId, src, meta)
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
    const meta = {
      title: hit.title,
      description: hit.description,
      icon_url: hit.icon_url ?? null,
      client_side: hit.client_side ?? null,
      server_side: hit.server_side ?? null
    }
    queueRef.current.push({ projectId: hit.project_id, src: source, meta })
    setAddStatus(prev => ({ ...prev, [hit.project_id]: { step: 'queued' } }))
    processQueue()
  }

  const handleDelete = async (filename) => {
    setDeleting(filename)
    try {
      await window.launcher.deleteMod(filename)
      setDeleteStatus(prev => ({ ...prev, [filename]: 'done' }))
      setInstalledMods(prev => prev.filter(m => m.filename !== filename))
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                  Mods présents sur le repo GitHub.
                </p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    className="footer-btn"
                    onClick={handleCheckUpdates}
                    disabled={checkingUpdates || loadingInstalled}
                    title="Vérifie si de nouvelles versions sont disponibles"
                  >
                    {checkingUpdates ? '🔍 Vérification...' : '🔄 Mises à jour'}
                  </button>
                  <button
                    className="footer-btn"
                    onClick={handleImport}
                    disabled={importing}
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

              {/* Bannière mises à jour disponibles */}
              {modUpdates.length > 0 && (
                <div style={{ marginBottom: 12, padding: '10px 14px', background: 'rgba(200,168,75,0.1)', border: '1px solid rgba(200,168,75,0.4)', borderRadius: 8 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 8px', color: 'var(--text)' }}>
                    📦 {modUpdates.length} mise(s) à jour disponible(s)
                  </p>
                  {modUpdates.map(u => (
                    <div key={u.projectId} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <div style={{ flex: 1, fontSize: 12 }}>
                        <span style={{ color: 'var(--text-muted)' }}>{u.currentFilename}</span>
                        <span style={{ color: 'var(--text-muted)', margin: '0 6px' }}>→</span>
                        <span style={{ color: 'var(--green)', fontWeight: 600 }}>{u.newFilename}</span>
                      </div>
                      {updateStatus[u.projectId] === 'done' ? (
                        <span style={{ fontSize: 12, color: 'var(--green)' }}>✓ Mis à jour</span>
                      ) : updateStatus[u.projectId] === 'error' ? (
                        <span style={{ fontSize: 12, color: 'var(--red)' }}>✗ Erreur</span>
                      ) : (
                        <button
                          className="btn-primary"
                          onClick={() => handleApplyUpdate(u)}
                          disabled={!!updatingMod}
                          style={{ fontSize: 11, padding: '4px 12px', flexShrink: 0 }}
                        >
                          {updatingMod === u.projectId ? '⏳...' : '⬆ Mettre à jour'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {!checkingUpdates && modUpdates.length === 0 && Object.values(updateStatus).some(s => s === 'done') && (
                <p style={{ color: 'var(--green)', fontSize: 12, marginBottom: 8 }}>✓ Tous les mods sont à jour.</p>
              )}

              {loadingInstalled && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Chargement...</p>}
              {!loadingInstalled && installedMods.length === 0 && (
                <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Aucun mod installé.</p>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {installedMods.map(mod => {
                  const sideBadge = getSideBadge(mod)
                  const displayName = mod.title || mod.filename
                  return (
                    <div key={mod.filename} className="mod-result-row">
                      <div className="mod-icon">
                        {mod.icon_url
                          ? <img src={mod.icon_url} alt="" draggable={false} />
                          : <span>🧩</span>
                        }
                      </div>
                      <div className="mod-result-info">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <strong>{displayName}</strong>
                          {sideBadge && (
                            <span className="mod-badge" style={{ background: sideBadge.color }}>
                              {sideBadge.label}
                            </span>
                          )}
                        </div>
                        {mod.description && (
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{mod.description}</span>
                        )}
                        {mod.title && (
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', opacity: 0.6 }}>{mod.filename}</span>
                        )}
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
                  )
                })}
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
