/*
 * Transport between the panel and the HT-Mesh Lua driver, via the Control4
 * Director broker (./broker.js, loaded for its window.Broker side effect).
 *
 *   panel -> driver  broker.executeCommand(LUA_COMMAND, { command, params: JSON })
 *                    broker.executeCommand(LUA_SYNC_COMMAND, {})  — rewrite every data variable
 *   driver -> panel  JSON string variables (VARIABLES), pushed live over Socket.IO
 *                    and re-read over REST every POLL_INTERVAL_MS while the tab is
 *                    visible — the push is an accelerator, polling is the guarantee
 *
 * Outside a Director web tab (no apihost/driverid/apitoken in the URL) the
 * Broker constructor throws; the client then runs offline: no data, and every
 * command is rejected.
 */
import './broker.js'

export const LUA_COMMAND = 'HTMESH_RPC'
export const LUA_SYNC_COMMAND = 'HTMESH_SYNC'

export const VARIABLES = {
  info: 'Information',
  nodes: 'Nodes',
  groups: 'Groups',
  scenes: 'Scenes',
  commandStatus: 'Command Status',
}

// An empty or unparseable value means "no data" and is delivered as null.
const parse = (v) => {
  if (!v || typeof v.value !== 'string' || v.value.trim() === '') return null
  try {
    return JSON.parse(v.value)
  } catch {
    return null
  }
}

// Worst-case staleness of the tab when the Socket.IO push is down.
const POLL_INTERVAL_MS = 10000
const POLL_TIMEOUT_MS = 8000

function brokerClient(broker) {
  const names = Object.values(VARIABLES)
  const linkListeners = new Set()
  let live = false
  let restOk = null // null until the first poll answers
  let polling = false

  // 'live' (push subscribed) | 'polling' (push down, REST fine) | 'offline' (REST failing)
  const linkState = () => (live ? 'live' : restOk === false ? 'offline' : 'polling')
  let lastLink = linkState()
  const emitLink = () => {
    const next = linkState()
    if (next === lastLink) return
    lastLink = next
    linkListeners.forEach((fn) => fn(next))
  }
  const setRestOk = (ok) => {
    restOk = ok
    emitLink()
  }

  broker.getLiveObservable().subscribe((v) => {
    live = v
    emitLink()
  })

  const poll = () => {
    if (polling) return
    polling = true
    broker
      .pollVariables(names, { quiet: true, timeoutMs: POLL_TIMEOUT_MS })
      .then(() => setRestOk(true), () => setRestOk(false))
      .finally(() => {
        polling = false
      })
  }

  poll()
  setInterval(() => {
    if (document.visibilityState === 'visible') poll()
  }, POLL_INTERVAL_MS)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') poll()
  })

  return {
    mode: 'director',

    onVariable(name, fn) {
      const sub = broker.getVariableObservable(name).subscribe((v) => fn(parse(v)))
      return () => sub.unsubscribe()
    },

    // fn(state) on every change of linkState(); called once immediately.
    onLink(fn) {
      linkListeners.add(fn)
      fn(lastLink)
      return () => linkListeners.delete(fn)
    },

    // Asks the driver to re-query the gateway and rewrite every data variable.
    // Completion is reported later through the Command Status variable.
    sync() {
      return broker.executeCommand(LUA_SYNC_COMMAND, {})
    },

    // Re-reads every variable and re-emits it even when unchanged, so
    // optimistic UI state is reset to the driver's values.
    refresh() {
      return broker.pollVariables(names, { force: true }).then(
        () => setRestOk(true),
        (err) => {
          setRestOk(false)
          throw err
        },
      )
    },

    send({ command, params }) {
      return broker.executeCommand(LUA_COMMAND, { command, params: JSON.stringify(params) })
    },
  }
}

function offlineClient(reason) {
  const offline = () => Promise.reject(new Error(`Not connected to Control4 Director (${reason})`))
  return {
    mode: 'offline',
    onVariable: () => () => {},
    onLink: (fn) => {
      fn('offline')
      return () => {}
    },
    sync: offline,
    refresh: offline,
    send: offline,
  }
}

let client = null

// One client per page — the broker opens a Socket.IO connection, so never create two.
export function getClient() {
  if (!client) {
    try {
      client = brokerClient(new window.Broker({ subscribeVariables: true }))
    } catch (err) {
      console.warn('[ht-mesh] Director broker unavailable:', err.message)
      client = offlineClient(err.message)
    }
  }
  return client
}
