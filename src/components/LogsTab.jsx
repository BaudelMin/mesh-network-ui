import { useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { clearLogs, formatEntry, getLogs, subscribeLogs } from '../api/logger.js'
import { Card } from './ui.jsx'

const LEVELS = ['debug', 'info', 'warn', 'error']
const LEVEL_FILTERS = [
  { id: 'debug', label: 'All (incl. function calls, broker.js trace)' },
  { id: 'info', label: 'Info and above' },
  { id: 'warn', label: 'Warnings and errors' },
  { id: 'error', label: 'Errors only' },
]
const SCOPES = [
  { id: '', label: 'All sources' },
  { id: 'client', label: 'Data to / from broker.js' },
  { id: 'gateway', label: 'Panel actions' },
  { id: 'broker', label: 'broker.js trace' },
]

// Rendering thousands of rows makes the tab sluggish; older matches stay in the
// buffer and are included in Copy / Download.
const MAX_RENDERED = 500

const timeOf = (d) => d.toISOString().slice(11, 23)

export default function LogsTab({ notify }) {
  const logs = useSyncExternalStore(subscribeLogs, getLogs)
  const [minLevel, setMinLevel] = useState('info')
  const [scope, setScope] = useState('')
  const [query, setQuery] = useState('')
  const [follow, setFollow] = useState(true)
  const listRef = useRef(null)

  const filtered = useMemo(() => {
    const min = LEVELS.indexOf(minLevel)
    const q = query.trim().toLowerCase()
    return logs.filter(
      (e) =>
        LEVELS.indexOf(e.level) >= min &&
        (!scope || e.scope === scope) &&
        (!q || e.message.toLowerCase().includes(q) || e.detail.toLowerCase().includes(q)),
    )
  }, [logs, minLevel, scope, query])
  const shown = filtered.length > MAX_RENDERED ? filtered.slice(-MAX_RENDERED) : filtered

  useLayoutEffect(() => {
    if (follow && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [shown, follow])

  // Scrolling up pauses following; scrolling back to the bottom resumes it.
  const onScroll = () => {
    const el = listRef.current
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24
    if (atBottom !== follow) setFollow(atBottom)
  }

  const asText = () => filtered.map(formatEntry).join('\n')

  const copy = () => {
    navigator.clipboard
      ?.writeText(asText())
      .then(() => notify(`Copied ${filtered.length} log lines`))
      .catch((err) => notify(`Copy failed: ${err.message} — use Download instead`))
  }

  const download = () => {
    const url = URL.createObjectURL(new Blob([asText()], { type: 'text/plain' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `ht-mesh-panel-log-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Card
      title="Logs"
      subtitle="Panel activity: functions called, and data sent to and received from broker.js."
    >
      <div className="log-toolbar">
        <select value={minLevel} onChange={(e) => setMinLevel(e.target.value)} aria-label="Level">
          {LEVEL_FILTERS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
        </select>
        <select value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Source">
          {SCOPES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <input
          type="search"
          className="log-search"
          placeholder="Filter text…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label className="log-follow">
          <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> Follow
        </label>
        <span className="muted small log-count">
          {filtered.length === logs.length ? `${logs.length} entries` : `${filtered.length} of ${logs.length} entries`}
        </span>
        <button type="button" className="btn btn-plain btn-sm" onClick={copy} disabled={!filtered.length}>Copy</button>
        <button type="button" className="btn btn-plain btn-sm" onClick={download} disabled={!filtered.length}>Download</button>
        <button type="button" className="btn btn-outline btn-sm" onClick={clearLogs} disabled={!logs.length}>Clear</button>
      </div>

      <div className="log-list" ref={listRef} onScroll={onScroll}>
        {filtered.length > shown.length && (
          <p className="log-more muted small">
            {filtered.length - shown.length} older entries hidden — narrow the filter, or use Copy / Download for all.
          </p>
        )}
        {shown.length === 0 ? (
          <p className="empty">No log entries{logs.length ? ' match the filter' : ' yet'}.</p>
        ) : (
          shown.map((e) => (
            <div key={e.id} className={`log-row log-${e.level}`}>
              <span className="log-time">{timeOf(e.time)}</span>
              <span className="log-level">{e.level}</span>
              <span className="log-scope">{e.scope}</span>
              {e.detail ? (
                <details className="log-msg">
                  <summary>{e.message}</summary>
                  <pre>{e.detail}</pre>
                </details>
              ) : (
                <span className="log-msg">{e.message}</span>
              )}
            </div>
          ))
        )}
      </div>
    </Card>
  )
}
