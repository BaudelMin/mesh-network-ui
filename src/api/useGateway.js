import { useCallback, useEffect, useRef, useState } from 'react'
import {
  EMPTY_GATEWAY,
  EMPTY_GROUPS,
  EMPTY_NODES,
  EMPTY_SCENES,
  toGateway,
  toGroups,
  toNodes,
  toScenes,
} from './adapters.js'
import { getClient, VARIABLES } from './client.js'
import { buildRequest, lightRequests } from './commands.js'
import { logDebug, logError, logInfo, logWarn } from './logger.js'

// Slider drags fire many changes; only the last value per command+target is sent.
const SEND_DEBOUNCE_MS = 250

// Time given to the driver to establish its gateway connection before the first sync.
const INITIAL_SYNC_DELAY_MS = 3000

// A sync stays busy until Nodes, Groups and Scenes have each changed, or this long.
// The driver re-reads the gateway every 15 s anyway.
const SYNC_BUSY_MAX_MS = 15000

const LISTS = [VARIABLES.nodes, VARIABLES.groups, VARIABLES.scenes]

const patchById = (id, patch) => (list) => list.map((x) => (x.id === id ? { ...x, ...patch } : x))

export function useGateway(notify) {
  const client = getClient()
  // Start from the empty defaults; an empty variable maps back to them (adapters.js).
  const [gateway, setGateway] = useState(EMPTY_GATEWAY)
  const [nodes, setNodes] = useState(EMPTY_NODES)
  const [groups, setGroups] = useState(EMPTY_GROUPS)
  const [scenes, setScenes] = useState(EMPTY_SCENES)
  // 'connecting' (initial wait) -> 'syncing' -> 'ready' | 'error'; 'offline' outside Director
  const [phase, setPhase] = useState(client.mode === 'offline' ? 'offline' : 'connecting')
  // 'live' | 'polling' | 'offline' — whether what is shown is current (see client.onLink)
  const [link, setLink] = useState('polling')
  // Variable name -> true once it has held a non-empty list since the page loaded.
  // Until then an empty list means "not loaded yet", not "none" (the driver
  // starts every variable empty and fills it after its first poll).
  const [seen, setSeen] = useState({})
  const timers = useRef({})
  // The running sync: { armed, pending: Set of list variables still to change, finish(complete) }
  const syncRun = useRef(null)

  // Ask the driver to re-read the gateway and rewrite every data variable, then
  // read back what it holds now. The driver has no completion signal, so the
  // sync counts as done once Nodes, Groups and Scenes have each changed since
  // it started, or after SYNC_BUSY_MAX_MS. Only one runs at a time: a second
  // call returns the running one instead of sending another Gateway.SYNC.
  // Resolves with the message to show.
  const sync = useCallback(() => {
    if (syncRun.current) {
      logInfo('gateway', 'sync() already running — not sending another Gateway.SYNC')
      return syncRun.current.promise
    }
    logInfo('gateway', 'sync() started')
    setPhase('syncing')

    let resolveDone
    const done = new Promise((resolve) => {
      resolveDone = resolve
    })
    const timer = setTimeout(() => resolveDone(false), SYNC_BUSY_MAX_MS)
    const run = {
      armed: false,
      pending: new Set(LISTS),
      finish: (complete) => {
        clearTimeout(timer)
        resolveDone(complete)
      },
    }
    syncRun.current = run

    run.promise = client
      .sync()
      .then(() => client.refresh())
      .then(() => {
        // Arm only now: client.refresh() re-emits every variable unchanged,
        // which must not count as the driver's answer.
        run.armed = true
        return done
      })
      .then((complete) => {
        const message = complete ? 'Gateway data refreshed' : 'Refresh requested — data updates as the gateway answers'
        logInfo('gateway', 'sync() finished', message)
        setPhase('ready')
        return message
      })
      .catch((err) => {
        logError('gateway', 'sync() failed', err.message)
        setPhase(client.mode === 'offline' ? 'offline' : 'error')
        throw err
      })
      .finally(() => {
        clearTimeout(timer)
        syncRun.current = null
      })
    return run.promise
  }, [client])

  useEffect(() => {
    // Called for every list variable update: marks it seen once it holds
    // items, and counts it towards the running sync.
    const arrived = (name, list) => {
      if (list.length) setSeen((s) => (s[name] ? s : { ...s, [name]: true }))
      const run = syncRun.current
      if (!run?.armed) return
      run.pending.delete(name)
      if (run.pending.size === 0) run.finish(true)
    }
    const onList = (name, adapt, set) =>
      client.onVariable(name, (d) => {
        const list = adapt(d)
        set(list)
        arrived(name, list)
      })
    const subs = [
      client.onLink(setLink),
      client.onVariable(VARIABLES.info, (d) => setGateway(toGateway(d))),
      onList(VARIABLES.nodes, toNodes, setNodes),
      onList(VARIABLES.groups, toGroups, setGroups),
      onList(VARIABLES.scenes, toScenes, setScenes),
    ]
    const timer =
      client.mode === 'offline'
        ? null
        : setTimeout(() => sync().catch((err) => notify(`Could not load gateway data: ${err.message}`)), INITIAL_SYNC_DELAY_MS)
    return () => {
      clearTimeout(timer)
      subs.forEach((unsubscribe) => unsubscribe())
    }
  }, [client, notify, sync])

  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), [])

  const send = useCallback(
    (request) => client.send(request).catch((err) => notify(`${request.command} not sent: ${err.message}`)),
    [client, notify],
  )

  const sendDebounced = useCallback(
    (request) => {
      const { command, params } = request
      const key = `${command}:${params.node_id ?? params.group_id ?? ''}`
      logDebug('gateway', `sendDebounced(${key}) — sends in ${SEND_DEBOUNCE_MS} ms`, params)
      clearTimeout(timers.current[key])
      timers.current[key] = setTimeout(() => {
        delete timers.current[key]
        send(request)
      }, SEND_DEBOUNCE_MS)
    },
    [send],
  )

  // Build requests first so an invalid value never reaches local state or the driver.
  const control = (scope, setList) => (id, patch) => {
    logDebug('gateway', `control${scope}(${id})`, patch)
    let requests
    try {
      requests = lightRequests(scope, id, patch)
    } catch (err) {
      logWarn('gateway', `control${scope}(${id}) rejected`, err.message)
      notify(err.message)
      return
    }
    setList(patchById(id, patch)) // optimistic; the next variable update is authoritative
    requests.forEach((r) => (patch.on !== undefined ? send(r) : sendDebounced(r)))
  }

  const sendCommand = (command, params) => {
    logDebug('gateway', `sendCommand(${command})`, params)
    try {
      return send(buildRequest(command, params))
    } catch (err) {
      logWarn('gateway', `sendCommand(${command}) rejected`, err.message)
      notify(err.message)
      return Promise.resolve()
    }
  }

  // An empty list is "waiting" (not "none") while the link isn't live, or
  // before that variable has held any items since the page loaded. Outside
  // Director nothing will ever arrive, so the normal empty states are shown.
  const waitingFor = (name) => client.mode !== 'offline' && (link !== 'live' || !seen[name])

  return {
    phase,
    link,
    waiting: {
      nodes: waitingFor(VARIABLES.nodes),
      groups: waitingFor(VARIABLES.groups),
      scenes: waitingFor(VARIABLES.scenes),
    },
    gateway,
    nodes,
    groups,
    scenes,
    controlNode: control('Node', setNodes),
    controlGroup: control('Group', setGroups),
    requestNodeState: (ids) => sendCommand('Node.STATE', { nodes: ids.slice(0, 16) }),
    recallScene: (sceneId) => sendCommand('Scene.RECALL', { scene_id: sceneId }),
    restart: () => sendCommand('Gateway.RESTART', {}),
    factoryReset: () => sendCommand('Gateway.RESTART', { reset: 'factory' }),
    refresh: sync,
  }
}
