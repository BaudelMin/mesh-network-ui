/*
 * HT-Mesh gateway commands this panel sends, and the params each one requires
 * (from the HTMesh Gateway API Reference).
 *
 * Every request is built as { command, params } and leaves the panel through the
 * single driver command SetDeviceState (ExecuteCommand → EX_CMD.SetDeviceState;
 * toDeviceStateParams below; format in docs/set-device-state.md). Values use the panel's
 * own ranges; the Lua driver converts them to wire ranges before sending
 * (see lua_requirement.md):
 *   hue         0–360   (degrees)   -> 0–65535
 *   saturation  0–100   (percent)   -> 0–65535
 *   lightness   0–100   (percent)   -> 0–65535
 *   brightness  0–100   (percent)   unchanged
 *   cct         2700–6500 (kelvin)  unchanged
 */

const nodeId = { name: 'node_id', type: 'string' }
const groupId = { name: 'group_id', type: 'string' }
const onoff = { name: 'onoff', type: 'number', values: [0, 1] }
const brightness = { name: 'brightness', type: 'number', min: 0, max: 100 }
const cct = { name: 'cct', type: 'number', min: 2700, max: 6500 }
const hue = { name: 'hue', type: 'number', min: 0, max: 360 }
const saturation = { name: 'saturation', type: 'number', min: 0, max: 100 }
const lightness = { name: 'lightness', type: 'number', min: 0, max: 100 }
const fadetime = { name: 'fadetime', type: 'number', min: 0 }

export const COMMAND_SPECS = {
  // Handled by the driver itself (not forwarded): rewrite every data variable.
  'Gateway.SYNC': { required: [], optional: [] },
  'Gateway.RESTART': { required: [], optional: [{ name: 'reset', type: 'string', values: ['factory'] }] },

  'Node.ONOFF': { required: [nodeId, onoff], optional: [fadetime] },
  'Node.BRIGHTNESS': { required: [nodeId, brightness], optional: [fadetime] },
  'Node.CCT': { required: [nodeId, cct], optional: [fadetime] },
  'Node.HSL': { required: [nodeId, hue, saturation, lightness], optional: [fadetime] },
  'Node.STATE': { required: [{ name: 'nodes', type: 'array', minItems: 1, maxItems: 16 }], optional: [] },

  'Group.ONOFF': { required: [groupId, onoff], optional: [fadetime] },
  'Group.BRIGHTNESS': { required: [groupId, brightness], optional: [fadetime] },
  'Group.CCT': { required: [groupId, cct], optional: [fadetime] },
  'Group.HSL': { required: [groupId, hue, saturation, lightness], optional: [fadetime] },

  'Scene.RECALL': { required: [{ name: 'scene_id', type: 'string' }], optional: [] },
}

function checkParam(command, spec, value) {
  const where = `${command}.${spec.name}`
  if (spec.type === 'array') {
    if (!Array.isArray(value)) throw new Error(`${where} must be an array`)
    if (value.length < spec.minItems || value.length > spec.maxItems) {
      throw new Error(`${where} must have ${spec.minItems}–${spec.maxItems} items`)
    }
    return value
  }
  if (typeof value !== spec.type || (spec.type === 'string' && value === '') || Number.isNaN(value)) {
    throw new Error(`${where} must be a non-empty ${spec.type}`)
  }
  if (spec.values && !spec.values.includes(value)) throw new Error(`${where} must be one of ${spec.values.join(', ')}`)
  if (spec.min !== undefined && value < spec.min) throw new Error(`${where} must be ≥ ${spec.min}`)
  if (spec.max !== undefined && value > spec.max) throw new Error(`${where} must be ≤ ${spec.max}`)
  return spec.type === 'number' ? Math.round(value) : value
}

// Validates params against the spec and drops anything the command doesn't take.
export function buildRequest(command, params = {}) {
  const spec = COMMAND_SPECS[command]
  if (!spec) throw new Error(`Unknown command ${command}`)

  const out = {}
  for (const p of spec.required) {
    if (params[p.name] === undefined) throw new Error(`${command} is missing ${p.name}`)
    out[p.name] = checkParam(command, p, params[p.name])
  }
  for (const p of spec.optional) {
    if (params[p.name] !== undefined) out[p.name] = checkParam(command, p, params[p.name])
  }
  return { command, params: out }
}

// The one driver command every request is sent through:
// broker.executeCommand → ExecuteCommand → EX_CMD.SetDeviceState(tParams).
export const DEVICE_STATE_COMMAND = 'SetDeviceState'

/*
 * { command, params } -> SetDeviceState tParams:
 *   command  string   e.g. "Node.ONOFF"
 *   params   string   JSON of the command's params, panel ranges
 *   id       string   target node / group / scene id; "" for gateway commands
 *                     and multi-node commands (Node.STATE carries params.nodes)
 *   isGroup  boolean  command targets a group  (Group.*)
 *   isScene  boolean  command targets a scene  (Scene.*)
 */
export function toDeviceStateParams({ command, params }) {
  const p = params || {}
  return {
    command,
    params: JSON.stringify(p),
    id: String(p.node_id ?? p.group_id ?? p.scene_id ?? ''),
    isGroup: command.startsWith('Group.'),
    isScene: command.startsWith('Scene.'),
  }
}

/*
 * Turns a light control patch ({ on } | { brightness } | { cct } | { hsl })
 * into requests for a node or group. HSL always sends all three components,
 * as the API requires.
 */
export function lightRequests(scope, id, patch) {
  const target = scope === 'Group' ? { group_id: id } : { node_id: id }
  const requests = []
  if (patch.on !== undefined) requests.push(buildRequest(`${scope}.ONOFF`, { ...target, onoff: patch.on ? 1 : 0 }))
  if (patch.brightness !== undefined) requests.push(buildRequest(`${scope}.BRIGHTNESS`, { ...target, brightness: patch.brightness }))
  if (patch.cct !== undefined) requests.push(buildRequest(`${scope}.CCT`, { ...target, cct: patch.cct }))
  if (patch.hsl !== undefined) {
    const { h, s, l } = patch.hsl
    requests.push(buildRequest(`${scope}.HSL`, { ...target, hue: h, saturation: s, lightness: l }))
  }
  return requests
}
