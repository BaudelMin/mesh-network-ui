import { useCallback, useEffect, useRef, useState } from 'react'
import { useGateway } from './api/useGateway.js'
import GroupsTab from './components/GroupsTab.jsx'
import InfoTab from './components/InfoTab.jsx'
import LogsTab from './components/LogsTab.jsx'
import NodesTab from './components/NodesTab.jsx'
import ScenesTab from './components/ScenesTab.jsx'
import { GridIcon, InfoIcon, LogIcon, RefreshIcon, SwapIcon, TriangleIcon, UsersIcon } from './components/icons.jsx'
import './App.css'

const PHASES = {
  offline: { label: 'Offline', title: 'Not running inside a Control4 Director web tab — no data or commands' },
  connecting: { label: 'Connecting…', title: 'Waiting for the driver to connect to the gateway' },
  syncing: { label: 'Syncing…', title: 'Requesting the latest data from the driver' },
  error: { label: 'Sync failed', title: 'The last data request failed — press Refresh to retry' },
}

const LINKS = {
  live: { label: 'Live', title: 'Receiving live updates from the driver' },
  polling: { label: 'Polling', title: 'Live updates unavailable — re-reading the driver every 10 s' },
  offline: { label: 'Offline', title: 'Cannot reach Director — the data shown may be out of date' },
}

const TABS = [
  { id: 'info', label: 'Information', icon: InfoIcon },
  { id: 'nodes', label: 'Nodes', icon: SwapIcon },
  { id: 'groups', label: 'Groups', icon: UsersIcon },
  { id: 'scenes', label: 'Scenes', icon: TriangleIcon },
  { id: 'logs', label: 'Logs', icon: LogIcon },
]

export default function App() {
  const [tab, setTab] = useState(() => {
    const fromHash = window.location.hash.slice(1)
    return TABS.some((t) => t.id === fromHash) ? fromHash : 'info'
  })

  const selectTab = (id) => {
    setTab(id)
    window.history.replaceState(null, '', `#${id}`)
  }
  const [selectedNode, setSelectedNode] = useState(null)
  const [selectedGroup, setSelectedGroup] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)
  const toastTimer = useRef()

  const notify = useCallback((message) => {
    clearTimeout(toastTimer.current)
    setToast(message)
    toastTimer.current = setTimeout(() => setToast(null), 3000)
  }, [])

  useEffect(() => () => clearTimeout(toastTimer.current), [])

  const api = useGateway(notify)
  const { gateway, nodes, groups, scenes, phase, link } = api
  const loading = phase === 'connecting' || phase === 'syncing'
  const showLink = phase !== 'offline' && phase !== 'connecting'

  const refresh = () => {
    setRefreshing(true)
    api
      .refresh()
      .then((message) => notify(message))
      .catch((err) => notify(`Refresh failed: ${err.message}`))
      .finally(() => setRefreshing(false))
  }

  // Selecting a node asks the driver for its live state (nodes don't push their own changes).
  const selectNode = (id) => {
    setSelectedNode(id)
    if (nodes.find((n) => n.id === id)?.online) api.requestNodeState([id])
  }

  const runGatewayAction = (label, confirmText, action) => {
    if (!window.confirm(confirmText)) return
    setBusy(true)
    action().then(() => notify(`${label} sent to gateway`))
    setTimeout(() => setBusy(false), 3000)
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-logo"><GridIcon /></span>
          <span className="brand-name">HT-MESH</span>
          <span className="brand-gateway">Gateway: {gateway.id || '—'}</span>
          {PHASES[phase] && (
            <span className={`type-tag phase-${phase}`} title={PHASES[phase].title}>
              {PHASES[phase].label}
            </span>
          )}
          {showLink && (
            <span className={`type-tag link-${link}`} title={LINKS[link].title}>
              {LINKS[link].label}
            </span>
          )}
        </div>
        <button
          type="button"
          className="btn btn-outline"
          onClick={refresh}
          disabled={refreshing || loading || phase === 'offline'}
        >
          <span className={refreshing || phase === 'syncing' ? 'spin' : ''}><RefreshIcon /></span> Refresh
        </button>
      </header>

      <nav className="tabs" role="tablist">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`tab ${tab === id ? 'active' : ''}`}
            onClick={() => selectTab(id)}
          >
            <Icon /> {label}
          </button>
        ))}
      </nav>

      <div className="banner">
        Node, group and gateway data update automatically as the gateway reports status. Press{' '}
        <strong>Refresh</strong> (top right) to re-read everything from the gateway.
      </div>

      <main className="content">
        {tab === 'info' && (
          <InfoTab
            gateway={gateway}
            busy={busy}
            onRestart={() => runGatewayAction('Restart', 'Soft-restart the gateway?', api.restart)}
            onFactoryReset={() =>
              runGatewayAction(
                'Factory reset',
                'Factory reset erases all mesh configuration on the gateway. Continue?',
                api.factoryReset,
              )
            }
          />
        )}
        {tab === 'nodes' && (
          <NodesTab
            nodes={nodes}
            loading={loading}
            selectedId={selectedNode}
            onSelect={selectNode}
            onUpdate={api.controlNode}
          />
        )}
        {tab === 'groups' && (
          <GroupsTab
            groups={groups}
            loading={loading}
            nodes={nodes}
            selectedId={selectedGroup}
            onSelect={setSelectedGroup}
            onUpdate={api.controlGroup}
          />
        )}
        {tab === 'scenes' && (
          <ScenesTab scenes={scenes} nodes={nodes} loading={loading} onRecall={api.recallScene} notify={notify} />
        )}
        {tab === 'logs' && <LogsTab notify={notify} />}
      </main>

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  )
}
