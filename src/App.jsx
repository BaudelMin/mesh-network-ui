import { useCallback, useEffect, useRef, useState } from 'react'
import GroupsTab from './components/GroupsTab.jsx'
import InfoTab from './components/InfoTab.jsx'
import NodesTab from './components/NodesTab.jsx'
import ScenesTab from './components/ScenesTab.jsx'
import { GridIcon, InfoIcon, RefreshIcon, SwapIcon, TriangleIcon, UsersIcon } from './components/icons.jsx'
import { gateway as initialGateway, initialGroups, initialNodes, initialScenes } from './data.js'
import './App.css'

const TABS = [
  { id: 'info', label: 'Information', icon: InfoIcon },
  { id: 'nodes', label: 'Nodes', icon: SwapIcon },
  { id: 'groups', label: 'Groups', icon: UsersIcon },
  { id: 'scenes', label: 'Scenes', icon: TriangleIcon },
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
  const [gateway, setGateway] = useState(initialGateway)
  const [nodes, setNodes] = useState(initialNodes)
  const [groups, setGroups] = useState(initialGroups)
  const [scenes] = useState(initialScenes)
  const [selectedNode, setSelectedNode] = useState(null)
  const [selectedGroup, setSelectedGroup] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)
  const toastTimer = useRef()

  const notify = useCallback((message) => {
    clearTimeout(toastTimer.current)
    setToast(message)
    toastTimer.current = setTimeout(() => setToast(null), 2500)
  }, [])

  useEffect(() => () => clearTimeout(toastTimer.current), [])

  const patchById = (id, patch) => (list) => list.map((x) => (x.id === id ? { ...x, ...patch } : x))
  const updateNode = (id, patch) => setNodes(patchById(id, patch))
  const updateGroup = (id, patch) => setGroups(patchById(id, patch))

  // Simulated pull of the latest gateway state.
  const refresh = () => {
    setRefreshing(true)
    setTimeout(() => {
      setGateway((g) => ({
        ...g,
        runtime: { ...g.runtime, uptimeSeconds: initialGateway.runtime.uptimeSeconds + Math.floor(performance.now() / 1000) },
      }))
      setRefreshing(false)
      notify('Gateway data refreshed')
    }, 600)
  }

  const runGatewayAction = (label, confirmText) => {
    if (!window.confirm(confirmText)) return
    setBusy(true)
    notify(`${label} sent to gateway`)
    setTimeout(() => setBusy(false), 3000)
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-logo"><GridIcon /></span>
          <span className="brand-name">HT-MESH</span>
          <span className="brand-gateway">Gateway: {gateway.id}</span>
        </div>
        <button type="button" className="btn btn-outline" onClick={refresh} disabled={refreshing}>
          <span className={refreshing ? 'spin' : ''}><RefreshIcon /></span> Refresh
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
        Node, group and gateway data update continuously in the background as the gateway reports status. Press{' '}
        <strong>Refresh</strong> (top right) to pull the latest into this view.
      </div>

      <main className="content">
        {tab === 'info' && (
          <InfoTab
            gateway={gateway}
            busy={busy}
            onRestart={() => runGatewayAction('Restart', 'Soft-restart the gateway?')}
            onFactoryReset={() =>
              runGatewayAction('Factory reset', 'Factory reset erases all mesh configuration on the gateway. Continue?')
            }
          />
        )}
        {tab === 'nodes' && (
          <NodesTab nodes={nodes} selectedId={selectedNode} onSelect={setSelectedNode} onUpdate={updateNode} />
        )}
        {tab === 'groups' && (
          <GroupsTab
            groups={groups}
            nodes={nodes}
            selectedId={selectedGroup}
            onSelect={setSelectedGroup}
            onUpdate={updateGroup}
          />
        )}
        {tab === 'scenes' && <ScenesTab scenes={scenes} nodes={nodes} notify={notify} />}
      </main>

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  )
}
