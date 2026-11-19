import { useCallback, useEffect, useRef, useState } from 'react'
import { isHiddenNode } from './api/adapters.js'
import { useGateway } from './api/useGateway.js'
import GroupsTab from './components/GroupsTab.jsx'
import InfoTab, { GATEWAY_ACTION_MS } from './components/InfoTab.jsx'
import LogsTab from './components/LogsTab.jsx'
import NodesTab from './components/NodesTab.jsx'
import ScenesTab from './components/ScenesTab.jsx'
import { GridIcon, InfoIcon, LogIcon, SwapIcon, TriangleIcon, UsersIcon } from './components/icons.jsx'
import './App.css'

const PHASES = {
  offline: { label: 'Offline', title: 'Not running inside a Control4 Director web tab — no data or commands' },
  connecting: { label: 'Connecting…', title: 'Waiting for the driver to connect to the gateway' },
  syncing: { label: 'Syncing…', title: 'Waiting for the driver to re-read nodes, groups and scenes from the gateway' },
  error: { label: 'Sync failed', title: 'The last data request failed — data updates on the next gateway poll' },
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
  // 'restart' | 'factoryReset' while that gateway action's animation runs
  const [busy, setBusy] = useState(null)
  const [toast, setToast] = useState(null)
  const toastTimer = useRef()

  const notify = useCallback((message) => {
    clearTimeout(toastTimer.current)
    setToast(message)
    toastTimer.current = setTimeout(() => setToast(null), 3000)
  }, [])

  useEffect(() => () => clearTimeout(toastTimer.current), [])

  const api = useGateway(notify)
  const { gateway, nodes, groups, scenes, phase, link, waiting } = api
  const showLink = phase !== 'offline' && phase !== 'connecting'
  // The Nodes tab leaves out hidden kinds (shades for now); Groups and Scenes
  // get every node so they can count and name all members.
  const visibleNodes = nodes.filter((n) => !isHiddenNode(n))

  // Selecting a node asks the driver for its live state (nodes don't push their own changes).
  const selectNode = (id) => {
    setSelectedNode(id)
    if (nodes.find((n) => n.id === id)?.online) api.requestNodeState([id])
  }

  // Runs once the user has pressed the action's Confirm button (ConfirmButton).
  const runGatewayAction = (key, label, action) => {
    setBusy(key)
    // Restart's button animation already tells the user; no toast for it.
    action().then(() => key !== 'restart' && notify(`${label} sent to gateway`))
    setTimeout(() => setBusy(null), GATEWAY_ACTION_MS)
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-logo"><GridIcon /></span>
          <span className="brand-name">HT-MESH</span>
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

      <main className="content">
        {tab === 'info' && (
          <InfoTab
            gateway={gateway}
            busy={busy}
            onRestart={() => runGatewayAction('restart', 'Restart', api.restart)}
            onFactoryReset={() => runGatewayAction('factoryReset', 'Factory reset', api.factoryReset)}
          />
        )}
        {tab === 'nodes' && (
          <NodesTab
            nodes={visibleNodes}
            waiting={waiting.nodes}
            selectedId={selectedNode}
            onSelect={selectNode}
            onUpdate={api.controlNode}
          />
        )}
        {tab === 'groups' && (
          <GroupsTab
            groups={groups}
            waiting={waiting.groups}
            nodes={nodes}
            selectedId={selectedGroup}
            onSelect={setSelectedGroup}
            onUpdate={api.controlGroup}
          />
        )}
        {tab === 'scenes' && (
          <ScenesTab scenes={scenes} nodes={nodes} waiting={waiting.scenes} onRecall={api.recallScene} notify={notify} />
        )}
        {tab === 'logs' && <LogsTab notify={notify} />}
      </main>

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  )
}
