import { useCallback, useEffect, useRef, useState } from 'react'
import { toGateway, toGroups, toNodes, toScenes } from './adapters.js'
import { getClient, VARIABLES } from './client.js'
import { buildRequest, lightRequests } from './commands.js'

// Slider drags fire many changes; only the last value per command+target is sent.
const SEND_DEBOUNCE_MS = 250

const patchById = (id, patch) => (list) => list.map((x) => (x.id === id ? { ...x, ...patch } : x))

function describeStatus({ command, code, message }) {
  if (code === 0) return `${command}: ${message || 'success'}`
  return `${command} failed: ${message || `error ${code}`}`
}

export function useGateway(notify) {
  const client = getClient()
  const [gateway, setGateway] = useState(null)
  const [nodes, setNodes] = useState([])
  const [groups, setGroups] = useState([])
  const [scenes, setScenes] = useState([])
  const timers = useRef({})
  const statusSeq = useRef(null)

  useEffect(() => {
    const subs = [
      client.onVariable(VARIABLES.info, (d) => setGateway(toGateway(d))),
      client.onVariable(VARIABLES.nodes, (d) => setNodes(toNodes(d))),
      client.onVariable(VARIABLES.groups, (d) => setGroups(toGroups(d))),
      client.onVariable(VARIABLES.scenes, (d) => setScenes(toScenes(d))),
      client.onVariable(VARIABLES.commandStatus, (s) => {
        // The first value seen is whatever was last reported before this page
        // loaded — remember its seq and only toast newer ones.
        if (statusSeq.current === null) {
          statusSeq.current = s.seq ?? 0
          return
        }
        if ((s.seq ?? 0) > statusSeq.current) {
          statusSeq.current = s.seq
          notify(describeStatus(s))
        }
      }),
    ]
    client.refresh().catch((err) => notify(`Could not read gateway data: ${err.message}`))
    return () => subs.forEach((unsubscribe) => unsubscribe())
  }, [client, notify])

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
    mode: client.mode,
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
    refresh: () => client.refresh(),
  }
}
