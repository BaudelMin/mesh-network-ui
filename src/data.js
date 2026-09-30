// Mock gateway data. Replace with real API calls when the driver endpoint is available.

export const gateway = {
  id: 'HYP-GW-HT-CDE15C',
  identity: {
    name: 'HYP-GW-HT_C4_0E_04',
    productId: 'HYP-GW-HT',
    manufacturer: 'Hypnotik',
    mac: '3C:0F:02:C4:0E:06',
    chipOs: 'esp32s3 · FreeRTOS-V10.5.1',
    fwHw: 'v1.0.1 (c007629) · v1.0.0',
    serial: '1',
    manufactured: 'Apr 30, 2026',
    provisioned: true,
    bleMesh: true,
  },
  runtime: {
    uptimeSeconds: 2 * 86400 + 6 * 3600 + 20 * 60 + 45,
    freeHeap: 208164,
    freeIram: 102400,
    freePsram: 3145728,
  },
  network: {
    wifiSsid: 'NDS-TPL-2.4G',
    wifiStatus: 'connected',
    wifiIp: '192.168.0.199',
    ethernetStatus: 'connected',
    ethernetIp: '192.168.1.149',
    host: 'HYP-GW-HT_C4_0E_04',
  },
  location: {
    region: 'Kathmandu/Nepal',
    timezone: '+0545',
    coordinates: '27.7172, 85.324',
    address: 'Kathmandu',
  },
}

// Mock nodes modelled on a 16-light mesh. id = node UUID reported by the gateway.
const NODE_SUFFIXES = [
  'C18CBE', 'C184EA', 'C19022', 'C190C6', 'B7A56A', 'C190DA', 'C18422', 'C190BE',
  'B7A4EA', '690FEE', 'C19236', 'C18502', 'C19266', 'B7A52A', 'C2AD3E', 'C18576',
]

export const initialNodes = NODE_SUFFIXES.map((suffix, i) => ({
  id: `6abcce2d9adef049cc886b${(0x52 + i).toString(16)}`,
  name: `HYP-LT-HT-${suffix}`,
  mac: `10:b4:1d:${suffix.match(/../g).join(':').toLowerCase()}`,
  product: 'HYP-LT-HT',
  type: 'light',
  online: i !== 0,
  on: false,
  mode: 'cct',
  brightness: 80,
  cct: 4000,
  hsl: { h: 0, s: 0, l: 0 },
  fade: 0,
}))

// Groups and scenes are configured from the mobile app; this panel only controls them.
// `members` holds node ids. A group's `type` picks its control UI, same as a node's.
export const initialGroups = [
  {
    id: 'living-room',
    name: 'Living Room',
    address: 0xc001,
    type: 'light',
    members: [initialNodes[1].id, initialNodes[2].id],
    on: true,
    mode: 'cct',
    brightness: 80,
    cct: 4000,
    hsl: { h: 0, s: 0, l: 0 },
  },
  {
    id: 'bedroom',
    name: 'Bedroom',
    address: 0xc002,
    type: 'light',
    members: [initialNodes[3].id],
    on: true,
    mode: 'cct',
    brightness: 80,
    cct: 4000,
    hsl: { h: 0, s: 0, l: 0 },
  },
]

export const initialScenes = [
  { id: 'movie-night', name: 'Movie Night', number: 1, members: [initialNodes[1].id, initialNodes[2].id] },
  { id: 'morning', name: 'Morning', number: 2, members: [initialNodes[4].id, initialNodes[3].id, initialNodes[5].id] },
]
