export default function Titlebar() {
  return (
    <div className="titlebar">
      <span className="titlebar-title">Time of Garden</span>
      <div className="titlebar-controls">
        <button
          className="titlebar-btn"
          onClick={() => window.launcher.minimize()}
          title="Réduire"
        >
          ─
        </button>
        <button
          className="titlebar-btn close"
          onClick={() => window.launcher.close()}
          title="Fermer"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
