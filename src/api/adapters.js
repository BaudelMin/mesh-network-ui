/*
 * Map the Lua driver's variables (shapes in lua_requirement.md) to UI state.
 * State values are already in panel ranges — hue 0–360, saturation/lightness 0–100.
 * Fields a node doesn't report for its mode stay undefined and are hidden in the UI.
 *
 * Lists (Nodes, Groups, Scenes, and each entry's `nodes`) may arrive either as a
 * JSON array or as an index-keyed object, which is what C4:JsonEncode produces.
 *
 * Every adapter always returns a complete value: an empty or unparseable variable
 * (delivered as null), a missing section or a missing field falls back to the
 * EMPTY_* defaults below, so components never have to null-check.
 */

const num = (v) => (typeof v === 'number' ? v : undefined)
const str = (v) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '')
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {})

// C4:JsonEncode writes a Lua array as an object keyed by index —
// {"1":{…},"2":{…}} — and an empty one as {}. Accept that as well as a real
// JSON array, in index order.
function toArray(v) {
  if (Array.isArray(v)) return v
  if (!v || typeof v !== 'object') return []
  return Object.keys(v)
    .sort((a, b) => Number(a) - Number(b) || a.localeCompare(b))
    .map((k) => v[k])
}
const list = (v) => toArray(v).filter((x) => x && typeof x === 'object')
const ids = (v) => toArray(v).map(str).filter(Boolean)

export const EMPTY_LIGHT_STATE = {
  on: undefined,
  brightness: undefined,
  masterBrightness: undefined,
  cct: undefined,
  cctBrightness: undefined,
  hsl: undefined,
}

function lightState(state) {
  const s = obj(state)
  const hasHsl = [s.hue, s.saturation, s.lightness].some((v) => typeof v === 'number')
  return {
    ...EMPTY_LIGHT_STATE,
    on: s.onoff === undefined ? undefined : s.onoff === 1 || s.onoff === true,
    brightness: num(s.brightness),
    masterBrightness: num(s.master_brightness),
    cct: num(s.cct),
    cctBrightness: num(s.cct_brightness),
    hsl: hasHsl ? { h: num(s.hue) ?? 0, s: num(s.saturation) ?? 0, l: num(s.lightness) ?? 0 } : undefined,
  }
}

// Shown before any gateway data arrives (or when Information is empty): every field blank.
// `available` is false until Information holds a Gateway.INFO result.
export const EMPTY_GATEWAY = {
  available: false,
  id: '',
  identity: {
    name: '', productId: '', manufacturer: '', mac: '', chipOs: '', fwHw: '', serial: '', manufactured: '',
    provisioned: false, bleMesh: false,
  },
  runtime: { uptimeSeconds: undefined, freeHeap: undefined, freeIram: undefined, freePsram: undefined },
  network: { wifi: '', wifiIp: '', ethernet: '', host: '' },
  location: { region: '', timezone: '', coordinates: '', address: '' },
}

export const EMPTY_NODES = []
export const EMPTY_GROUPS = []
export const EMPTY_SCENES = []

// `info` and `status` are read independently: either may be empty without
// blanking the other (e.g. a Gateway.STATUS push before the first Gateway.INFO).
export function toGateway(data) {
  const d = obj(data)
  const info = obj(d.info)
  const status = obj(d.status)
  const memory = obj(status.memory)
  const network = obj(info.network)
  const wifi = obj(network.wifi)
  const eth = obj(network.ethernet)
  const loc = obj(info.location)
  const join = (...parts) => parts.filter(Boolean).join(' · ')
  const available = Object.keys(info).length > 0
  const fw = str(info.fw_version)
  const commit = str(info.commit_hash)

  return {
    available,
    id: str(info.gateway_id) || str(info.name),
    identity: {
      name: str(info.name),
      productId: str(info.product_id),
      manufacturer: str(info.manufacturer),
      mac: str(info.mac),
      chipOs: join(str(info.chip), str(info.os)),
      fwHw: join(fw && `${fw}${commit ? ` (${commit})` : ''}`, str(info.hw_version)),
      serial: str(info.serial),
      manufactured: str(info.date_of_manufacture),
      provisioned: Boolean(status.gw_provisioned ?? info.gw_provisioned),
      bleMesh: Boolean(status.bleEnabled ?? info.bleEnabled),
    },
    runtime: {
      // Gateway.STATUS reports uptime in microseconds.
      uptimeSeconds: typeof status.uptime === 'number' ? Math.floor(status.uptime / 1e6) : undefined,
      freeHeap: num(memory.free_heap),
      freeIram: num(memory.free_iram),
      freePsram: num(memory.free_psram),
    },
    network: available
      ? {
          wifi: wifi.ssid ? join(str(wifi.ssid), wifi.connected ? 'connected' : 'disconnected') : 'not connected',
          wifiIp: str(wifi.ip),
          ethernet: eth.connected ? join('connected', str(eth.ip)) : 'not connected',
          host: str(obj(obj(network.discovery_method).mdns).hostname),
        }
      : { ...EMPTY_GATEWAY.network },
    location: {
      region: str(loc.region),
      timezone: str(loc.timezone),
      coordinates: typeof loc.latitude === 'number' && typeof loc.longitude === 'number' ? `${loc.latitude}, ${loc.longitude}` : '',
      address: str(loc.address),
    },
  }
}

// Node kinds, identified by `product_id` (dev_type is "light" for both).
export const PRODUCT_IDS = { light: 'HYP-LT-HT', shade: 'HYP-SH-HT' }
export const NODE_KINDS = { light: 'Light', shade: 'Shade' }

// Shades have no control UI yet, so their nodes are left out of the Nodes tab
// for now (they are still counted and named in groups and scenes). Remove a
// kind from HIDDEN_NODE_KINDS to show it again.
export const HIDDEN_NODE_KINDS = ['shade']
export const isHiddenNode = (node) => HIDDEN_NODE_KINDS.includes(node.kind)

function nodeKind(productId, devType) {
  const kind = Object.keys(PRODUCT_IDS).find((k) => PRODUCT_IDS[k] === productId)
  return kind || devType || 'light'
}

/*
 * Counts a group's / scene's member node ids by kind, using the Nodes list:
 *   { light: 2, shade: 1, unknown: 0 }
 * `unknown` is a member id that isn't in Nodes (not loaded yet, or removed).
 */
export function countMembersByKind(memberIds, nodes) {
  const counts = { ...Object.fromEntries(Object.keys(NODE_KINDS).map((k) => [k, 0])), unknown: 0 }
  for (const id of memberIds) {
    const kind = nodes.find((n) => n.id === id)?.kind
    if (kind && kind in counts) counts[kind] += 1
    else counts.unknown += 1
  }
  return counts
}

// Entries without an id can't be addressed by a command, so they are dropped.
export const toNodes = (data) =>
  list(data)
    .map((n) => ({
      id: str(n.id),
      name: str(n.name) || str(n.id),
      mac: str(n.mac),
      product: str(n.product_id),
      kind: nodeKind(str(n.product_id), str(n.dev_type)),
      type: str(n.dev_type) || 'light',
      online: Boolean(n.is_alive),
      mode: num(n.mode),
      ...lightState(n.state),
    }))
    .filter((n) => n.id)

export const toGroups = (data) =>
  list(data)
    .map((g) => ({
      id: str(g.group_id),
      name: str(g.group_name) || str(g.group_id),
      address: num(g.group_addr),
      type: str(g.type) || 'light',
      members: ids(g.nodes),
      ...lightState(g.state),
    }))
    .filter((g) => g.id)

export const toScenes = (data) =>
  list(data)
    .map((s) => ({
      id: str(s.scene_id),
      name: str(s.scene_name) || str(s.scene_id),
      number: num(s.scene_number),
      members: ids(s.nodes),
    }))
    .filter((s) => s.id)
