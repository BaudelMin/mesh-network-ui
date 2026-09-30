/*
 * Transport between the panel and the HT-Mesh Lua driver, via the Control4
 * Director broker (./broker.js, loaded for its window.Broker side effect).
 *
 *   panel -> driver  broker.executeCommand(LUA_COMMAND, { command, params: JSON })
 *   driver -> panel  JSON string variables (VARIABLES), pushed live over Socket.IO
 *
 * Outside a Director web tab (no apihost/driverid/apitoken in the URL, e.g.
 * `npm run dev`), the Broker constructor throws and a mock client serves
 * src/data.js instead, logging every command to the console.
 */
import './broker.js'
import { mockVariables } from '../data.js'

export const LUA_COMMAND = 'HTMESH_RPC'

export const VARIABLES = {
  info: 'Information',
  nodes: 'Nodes',
  groups: 'Groups',
  scenes: 'Scenes',
  commandStatus: 'Command Status',
}

const parse = (v) => {
  try {
    return v && v.value ? JSON.parse(v.value) : null
  } catch {
    return null
  }
}

function brokerClient(broker) {
  return {
    mode: 'director',

    onVariable(name, fn) {
      const sub = broker.getVariableObservable(name).subscribe((v) => {
        const data = parse(v)
        if (data !== null) fn(data)
      })
      return () => sub.unsubscribe()
    },

    // On-demand re-read of every variable (the live feed keeps them current otherwise).
    refresh() {
      return broker.getDeviceVariables(broker.id, Object.values(VARIABLES)).then((vars) => {
        ;(vars || []).forEach((v) => broker.getVariableObservable(v.varName).next(v))
      })
    },

    send({ command, params }) {
      return broker.executeCommand(LUA_COMMAND, { command, params: JSON.stringify(params) })
    },
  }
}

function mockClient() {
  const listeners = {}
  const emit = (name) => (listeners[name] || []).forEach((fn) => fn(mockVariables[name]))

  return {
    mode: 'mock',

    onVariable(name, fn) {
      ;(listeners[name] ||= []).push(fn)
      if (mockVariables[name] !== undefined) fn(mockVariables[name])
      return () => {
        listeners[name] = listeners[name].filter((f) => f !== fn)
      }
    },

    refresh() {
      Object.keys(mockVariables).forEach(emit)
      return Promise.resolve()
    },

    send(request) {
      console.info('[ht-mesh] mock send', LUA_COMMAND, request)
      return Promise.resolve()
    },
  }
}

let client = null

// One client per page — the broker opens a Socket.IO connection, so never create two.
export function getClient() {
  if (!client) {
    try {
      client = brokerClient(new window.Broker({ subscribeVariables: { pollVariablesPeriod: 30000 } }))
    } catch (err) {
      console.info('[ht-mesh] Director broker unavailable, using mock data:', err.message)
      client = mockClient()
    }
  }
  return client
}
