import { useEffect, useRef } from 'react'

export default function ConsoleLog({ logs }) {
  const ref = useRef(null)

  useEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight
    }
  }, [logs])

  const classify = (msg) => {
    const m = String(msg).toLowerCase()
    if (m.includes('error') || m.includes('erreur')) return 'error'
    if (m.includes('warn')) return 'warn'
    if (m.includes('[launcher]')) return 'info'
    return ''
  }

  return (
    <div className="console-log" ref={ref}>
      {logs.length === 0 && <p className="info">En attente de logs...</p>}
      {logs.map((log, i) => (
        <p key={i} className={classify(log)}>{log}</p>
      ))}
    </div>
  )
}
