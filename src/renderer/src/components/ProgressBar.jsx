export default function ProgressBar({ progress }) {
  if (!progress) {
    return (
      <div className="progress-container">
        <div className="progress-label">Préparation...</div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: '5%' }} />
        </div>
      </div>
    )
  }

  const { type, task, total } = progress
  const pct = total > 0 ? Math.round((task / total) * 100) : 0

  const labels = {
    'assets': 'Téléchargement des assets',
    'classes': 'Téléchargement des classes',
    'natives': 'Extraction des natives',
    'forge': 'Installation de Forge',
    'libraries': 'Téléchargement des librairies'
  }
  const label = labels[type] ?? type ?? 'Chargement...'

  return (
    <div className="progress-container">
      <div className="progress-label">{label} — {pct}%</div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
