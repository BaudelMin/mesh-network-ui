/*
 * Map the Lua driver's variables (shapes in lua_requirement.md) to UI state.
 * State values are already in panel ranges — hue 0–360, saturation/lightness 0–100.
 * Fields a node doesn't report for its mode stay undefined and are hidden in the UI.
 */

const num = (v) => (typeof v === 'number' ? v : undefined)

function lightState(state) {
  const s = state || {}
  const hasHsl = [s.hue, s.saturation, s.lightness].some((v) => typeof v === 'number')
  return {
    on: s.onoff === undefined ? undefined : s.onoff === 1,
    brightness: num(s.brightness),
    masterBrightness: num(s.master_brightness),
    cct: num(s.cct),
    cctBrightness: num(s.cct_brightness),
    hsl: hasHsl ? { h: s.hue ?? 0, s: s.saturation ?? 0, l: s.lightness ?? 0 } : undefined,
  }
}

export function toGateway(data) {
  const info = data?.info || {}
  const status = data?.status || {}
  const wifi = info.network?.wifi || {}
  const eth = info.network?.ethernet || {}
  const loc = info.location || {}
  const join = (...parts) => parts.filter(Boolean).join(' · ') || '—'
  const coords = typeof loc.latitude === 'number' ? `${loc.latitude}, ${loc.longitude}` : '—'

  return {
    id: info.gateway_id || info.name || '—',
    identity: {
      name: info.name || '—',
      productId: info.product_id || '—',
      manufacturer: info.manufacturer || '—',
      mac: info.mac || '—',
      chipOs: join(info.chip, info.os),
      fwHw: join(info.fw_version && `${info.fw_version}${info.commit_hash ? ` (${info.commit_hash})` : ''}`, info.hw_version),
      serial: info.serial || '—',
      manufactured: info.date_of_manufacture || '—',
      provisioned: Boolean(status.gw_provisioned ?? info.gw_provisioned),
      bleMesh: Boolean(status.bleEnabled ?? info.bleEnabled),
    },
    runtime: {
      // Gateway.STATUS reports uptime in microseconds.
      uptimeSeconds: typeof status.uptime === 'number' ? Math.floor(status.uptime / 1e6) : undefined,
      freeHeap: status.memory?.free_heap,
      freeIram: status.memory?.free_iram,
      freePsram: status.memory?.free_psram,
    },
    network: {
      wifi: wifi.ssid ? join(wifi.ssid, wifi.connected ? 'connected' : 'disconnected') : 'not connected',
      wifiIp: wifi.ip || '—',
      ethernet: eth.connected ? join('connected', eth.ip) : 'not connected',
      host: info.network?.discovery_method?.mdns?.hostname || '—',
    },
    location: {
      region: loc.region || '—',
      timezone: loc.timezone || '—',
      coordinates: coords,
      address: loc.address || '—',
    },
  }
}

export const toNodes = (list) =>
  (Array.isArray(list) ? list : []).map((n) => ({
    id: n.id,
    name: n.name || n.id,
    mac: n.mac,
    product: n.product_id,
    type: n.dev_type || 'light',
    online: Boolean(n.is_alive),
    mode: num(n.mode),
    ...lightState(n.state),
  }))

export const toGroups = (list) =>
  (Array.isArray(list) ? list : []).map((g) => ({
    id: g.group_id,
    name: g.group_name || g.group_id,
    address: num(g.group_addr),
    type: g.type || 'light',
    members: Array.isArray(g.nodes) ? g.nodes : [],
    ...lightState(g.state),
  }))

export const toScenes = (list) =>
  (Array.isArray(list) ? list : []).map((s) => ({
    id: s.scene_id,
    name: s.scene_name || s.scene_id,
    number: num(s.scene_number),
    members: Array.isArray(s.nodes) ? s.nodes : [],
  }))
