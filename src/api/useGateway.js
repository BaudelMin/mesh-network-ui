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
  const timers = useRef({})

  // Ask the driver to rewrite every data variable, then read back what it holds
  // now. The driver has no completion signal (no status variable): each
  // variable it rewrites as the gateway answers arrives over the live push /
  // poll and updates the view by itself. Resolves with the message to show.
  const sync = useCallback(() => {
    logInfo('gateway', 'sync() started')
    setPhase('syncing')
    return client
      .sync()
      .then(() => client.refresh())
      .then(() => {
        const message = 'Refresh requested — data updates as the gateway answers'
        logInfo('gateway', 'sync() finished', message)
        setPhase('ready')
        return message
      })
      .catch((err) => {
        logError('gateway', 'sync() failed', err.message)
        setPhase(client.mode === 'offline' ? 'offline' : 'error')
        throw err
      })
  }, [client])

  useEffect(() => {
    const subs = [
      client.onLink(setLink),
      client.onVariable(VARIABLES.info, (d) => setGateway(toGateway(d))),
      client.onVariable(VARIABLES.nodes, (d) => setNodes(toNodes(d))),
      client.onVariable(VARIABLES.groups, (d) => setGroups(toGroups(d))),
      client.onVariable(VARIABLES.scenes, (d) => setScenes(toScenes(d))),
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

  return {
    phase,
    link,
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
