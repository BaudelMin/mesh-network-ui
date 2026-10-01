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
import { getClient, LUA_SYNC_COMMAND, VARIABLES } from './client.js'
import { buildRequest, lightRequests } from './commands.js'

// Slider drags fire many changes; only the last value per command+target is sent.
const SEND_DEBOUNCE_MS = 250

// Time given to the driver to establish its gateway connection before the first sync.
const INITIAL_SYNC_DELAY_MS = 3000

// How long a sync may take before the variables are read back anyway.
const SYNC_TIMEOUT_MS = 20000

const patchById = (id, patch) => (list) => list.map((x) => (x.id === id ? { ...x, ...patch } : x))

function describeStatus({ command, code, message }) {
  if (code === 0) return `${command}: ${message || 'success'}`
  return `${command} failed: ${message || `error ${code}`}`
}

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
  const statusSeq = useRef(null)
  // { since, resolve, timer } while a sync waits for its HTMESH_SYNC Command Status
  const syncWaiter = useRef(null)

  // Resolves with the driver's HTMESH_SYNC status, or null after SYNC_TIMEOUT_MS.
  const waitForSyncStatus = useCallback(() => {
    if (syncWaiter.current) return syncWaiter.current.promise
    const waiter = { since: statusSeq.current ?? 0 }
    waiter.promise = new Promise((resolve) => {
      waiter.resolve = (status) => {
        clearTimeout(waiter.timer)
        if (syncWaiter.current === waiter) syncWaiter.current = null
        resolve(status)
      }
      waiter.timer = setTimeout(() => waiter.resolve(null), SYNC_TIMEOUT_MS)
    })
    syncWaiter.current = waiter
    return waiter.promise
  }, [])

  // Ask the driver to rewrite every data variable, wait until it reports the
  // sync finished, then read them back. Resolves with the message to show.
  const sync = useCallback(() => {
    setPhase('syncing')
    let done
    return client
      .refresh() // establishes the Command Status baseline before sending
      .then(() => {
        done = waitForSyncStatus()
        return client.sync().catch((err) => {
          syncWaiter.current?.resolve(null)
          throw err
        })
      })
      .then(() => done)
      .then((status) =>
        client.refresh().then(() => {
          if (!status) return 'Gateway slow to answer — showing the latest data received'
          if (status.code !== 0) throw new Error(status.message || `error ${status.code}`)
          return status.message || 'Gateway data refreshed'
        }),
      )
      .then((message) => {
        setPhase('ready')
        return message
      })
      .catch((err) => {
        setPhase(client.mode === 'offline' ? 'offline' : 'error')
        throw err
      })
  }, [client, waitForSyncStatus])

  useEffect(() => {
    const subs = [
      client.onLink(setLink),
      client.onVariable(VARIABLES.info, (d) => setGateway(toGateway(d))),
      client.onVariable(VARIABLES.nodes, (d) => setNodes(toNodes(d))),
      client.onVariable(VARIABLES.groups, (d) => setGroups(toGroups(d))),
      client.onVariable(VARIABLES.scenes, (d) => setScenes(toScenes(d))),
      client.onVariable(VARIABLES.commandStatus, (s) => {
        if (!s) return
        const seq = s.seq ?? 0
        const waiter = syncWaiter.current
        if (waiter && s.command === LUA_SYNC_COMMAND && seq > waiter.since) {
          statusSeq.current = Math.max(statusSeq.current ?? 0, seq)
          waiter.resolve(s) // the sync caller shows the message
          return
        }
        // The first value seen is whatever was last reported before this page
        // loaded — remember its seq and only toast newer ones.
        if (statusSeq.current === null) {
          statusSeq.current = seq
          return
        }
        if (seq > statusSeq.current) {
          statusSeq.current = seq
          // Sync outcomes are reported by sync() itself.
          if (s.command !== LUA_SYNC_COMMAND) notify(describeStatus(s))
        }
      }),
    ]
    const timer =
      client.mode === 'offline'
        ? null
        : setTimeout(() => sync().catch((err) => notify(`Could not load gateway data: ${err.message}`)), INITIAL_SYNC_DELAY_MS)
    return () => {
      clearTimeout(timer)
      subs.forEach((unsubscribe) => unsubscribe())
      syncWaiter.current?.resolve(null)
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
    let requests
    try {
      requests = lightRequests(scope, id, patch)
    } catch (err) {
      notify(err.message)
      return
    }
    setList(patchById(id, patch)) // optimistic; the next variable update is authoritative
    requests.forEach((r) => (patch.on !== undefined ? send(r) : sendDebounced(r)))
  }

  const sendCommand = (command, params) => {
    try {
      return send(buildRequest(command, params))
    } catch (err) {
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
