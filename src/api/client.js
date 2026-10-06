/*
 * Transport between the panel and the HT-Mesh Lua driver, via the Control4
 * Director broker (./broker.js, loaded for its window.Broker side effect).
 *
 *   panel -> driver  broker.executeCommand('SetDeviceState', { command, params: JSON, id, isGroup, isScene })
 *                    → ExecuteCommand → EX_CMD.SetDeviceState(tParams)
 *                    — every command, including Gateway.SYNC (rewrite every data variable);
 *                    format in docs/set-device-state.md
 *   driver -> panel  JSON string variables (VARIABLES), pushed live over Socket.IO
 *                    and re-read via broker.pollVariables every POLL_INTERVAL_MS while the tab is
 *                    visible — the push is an accelerator, polling is the guarantee
 *
 * Outside a Director web tab (no apihost/driverid/apitoken in the URL) the
 * Broker constructor throws; the client then runs offline: no data, and every
 * command is rejected.
 */
import './broker.js'
import { DEVICE_STATE_COMMAND, toDeviceStateParams } from './commands.js'
import { attachBroker, logDebug, logError, logInfo, logWarn } from './logger.js'

export const SYNC_COMMAND = 'Gateway.SYNC'

export const VARIABLES = {
  info: 'Information',
  nodes: 'Nodes',
  groups: 'Groups',
  scenes: 'Scenes',
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
  let readOk = null // null until the first poll answers
  let polling = false

  // Every call into broker.js goes through here, so the Logs tab shows what the
  // panel handed to broker.js and what came back. Background polls log at
  // debug level so they don't drown out user actions.
  const callBroker = (method, args, { background = false, label = `broker.${method}`, detail = args } = {}) => {
    const logOk = background ? logDebug : logInfo
    logOk('client', `→ ${label}`, detail)
    return broker[method](...args).then(
      (res) => {
        logOk('client', `← ${label}`, res)
        return res
      },
      (err) => {
        ;(background ? logWarn : logError)('client', `✕ ${label}`, err.message)
        throw err
      },
    )
  }

  // The only way a request leaves the panel: broker.executeCommand('SetDeviceState', tParams).
  // The log line names the request and target and shows the exact tParams,
  // plus `params` decoded for readability.
  const sendDeviceState = (request) => {
    const tParams = toDeviceStateParams(request)
    const kind = tParams.isGroup ? 'group' : tParams.isScene ? 'scene' : 'node'
    const target = tParams.id ? ` → ${kind} ${tParams.id}` : ''
    return callBroker('executeCommand', [DEVICE_STATE_COMMAND, tParams], {
      label: `${DEVICE_STATE_COMMAND} ${tParams.command}${target}`,
      detail: { command: DEVICE_STATE_COMMAND, tParams, paramsDecoded: request.params || {} },
    })
  }

  // Data delivered by broker.js: one line per variable change (push or poll).
  names.forEach((name) =>
    broker.getVariableObservable(name).subscribe((v) => logInfo('client', `← variable ${name}`, v?.value)),
  )

  // 'live' (push subscribed) | 'polling' (push down, reads fine) | 'offline' (reads failing)
  const linkState = () => (live ? 'live' : readOk === false ? 'offline' : 'polling')
  let lastLink = linkState()
  const emitLink = () => {
    const next = linkState()
    if (next === lastLink) return
    ;(next === 'live' ? logInfo : logWarn)('client', `link ${lastLink} → ${next}`)
    lastLink = next
    linkListeners.forEach((fn) => fn(next))
  }
  const setReadOk = (ok) => {
    readOk = ok
    emitLink()
  }

  broker.getLiveObservable().subscribe((v) => {
    logInfo('client', `← broker live: ${v}`)
    live = v
    emitLink()
  })

  const poll = () => {
    if (polling) {
      logDebug('client', 'poll() skipped — previous poll still running')
      return
    }
    logDebug('client', 'poll()')
    polling = true
    callBroker('pollVariables', [names, { quiet: true, timeoutMs: POLL_TIMEOUT_MS }], { background: true })
      .then(
        () => setReadOk(true),
        () => setReadOk(false),
      )
      .finally(() => {
        polling = false
      })
  }

  poll()
  setInterval(() => {
    if (document.visibilityState === 'visible') poll()
  }, POLL_INTERVAL_MS)
  document.addEventListener('visibilitychange', () => {
    logDebug('client', `tab ${document.visibilityState}`)
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
    // The rewritten variables arrive later over the live push / poll.
    sync() {
      logDebug('client', 'sync()')
      return sendDeviceState({ command: SYNC_COMMAND, params: {} })
    },

    // Re-reads every variable and re-emits it even when unchanged, so
    // optimistic UI state is reset to the driver's values.
    refresh() {
      logDebug('client', 'refresh()')
      return callBroker('pollVariables', [names, { force: true }]).then(
        () => setReadOk(true),
        (err) => {
          setReadOk(false)
          throw err
        },
      )
    },

    send(request) {
      logDebug('client', `send(${request.command})`, request.params)
      return sendDeviceState(request)
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
    attachBroker(window.Broker)
    try {
      client = brokerClient(new window.Broker({ subscribeVariables: true }))
      logInfo('client', 'Director client ready')
    } catch (err) {
      console.warn('[ht-mesh] Director broker unavailable:', err.message)
      logWarn('client', 'Director broker unavailable — running offline', err.message)
      client = offlineClient(err.message)
    }
  }
  return client
}
