/*
 * In-page log shown on the Logs tab. The panel talks to Director only through
 * broker.js: client.js logs every call it makes into broker.js and every value
 * broker.js delivers back; useGateway.js logs panel actions. broker.js's own
 * trace hook (window.Broker.log, see attachBroker) is captured at debug level.
 *
 * Levels: 'debug' (function calls, broker.js trace), 'info' (data sent to /
 * received from broker.js, state changes), 'warn', 'error'. With ?debug=1 in
 * the tab URL every entry is also written to the console.
 */

const MAX_ENTRIES = 2000
const MAX_DETAIL_CHARS = 4000

const consoleEcho = new URLSearchParams(window.location.search).get('debug') === '1'

let entries = []
let nextId = 1
const listeners = new Set()
let notifyQueued = false

// Details are stringified when logged, so later mutation of the object
// doesn't change what the log shows.
function formatDetail(detail) {
  if (detail === undefined || detail === null || detail === '') return ''
  let text
  if (typeof detail === 'string') text = detail
  else if (detail instanceof Error) text = detail.message
  else {
    try {
      text = JSON.stringify(detail, null, 2)
    } catch {
      text = String(detail)
    }
  }
  return text.length > MAX_DETAIL_CHARS ? `${text.slice(0, MAX_DETAIL_CHARS)}… (${text.length} chars)` : text
}

function notify() {
  if (notifyQueued) return
  notifyQueued = true
  queueMicrotask(() => {
    notifyQueued = false
    listeners.forEach((fn) => fn())
  })
}

export function log(level, scope, message, detail) {
  const entry = { id: nextId++, time: new Date(), level, scope, message: String(message), detail: formatDetail(detail) }
  entries = entries.length >= MAX_ENTRIES ? [...entries.slice(1 - MAX_ENTRIES), entry] : [...entries, entry]
  if (consoleEcho && level !== 'warn' && level !== 'error') console.debug(`[${scope}]`, entry.message, entry.detail)
  notify()
}

export const logDebug = (scope, message, detail) => log('debug', scope, message, detail)
export const logInfo = (scope, message, detail) => log('info', scope, message, detail)
export const logWarn = (scope, message, detail) => log('warn', scope, message, detail)
export const logError = (scope, message, detail) => log('error', scope, message, detail)

export function clearLogs() {
  entries = []
  notify()
}

// For useSyncExternalStore.
export const getLogs = () => entries
export function subscribeLogs(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function formatEntry(e) {
  const time = e.time.toISOString().slice(11, 23)
  return `${time} ${e.level.toUpperCase().padEnd(5)} [${e.scope}] ${e.message}${e.detail ? `\n${e.detail}` : ''}`
}

// Route broker.js's own trace hook into this log, at debug level. broker.js
// already writes its warn-level events to console.warn itself.
export function attachBroker(Broker) {
  Broker.log = (scope, message, detail) => log('debug', scope, message, detail)
}
