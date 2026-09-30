/*
 * Mock payloads for the Lua driver's variables, used when the panel runs
 * outside a Director web tab (e.g. `npm run dev`). Shapes match
 * lua_requirement.md; light state is already in panel ranges
 * (hue 0–360, saturation/lightness 0–100).
 */

const NODE_SUFFIXES = [
  'C18CBE', 'C184EA', 'C19022', 'C190C6', 'B7A56A', 'C190DA', 'C18422', 'C190BE',
  'B7A4EA', '690FEE', 'C19236', 'C18502', 'C19266', 'B7A52A', 'C2AD3E', 'C18576',
]

// Every 4th node is a mode 1 (single brightness channel) light; the rest are mode 2 (CCT/HSL).
const nodes = NODE_SUFFIXES.map((suffix, i) => {
  const mode = i % 4 === 3 ? 1 : 2
  return {
    id: `6abcce2d9adef049cc886b${(0x52 + i).toString(16)}`,
    name: `HYP-LT-HT-${suffix}`,
    mac: `10:b4:1d:${suffix.match(/../g).join(':').toLowerCase()}`,
    product_id: 'HYP-LT-HT',
    dev_type: 'light',
    is_alive: i !== 0,
    mode,
    state:
      mode === 1
        ? { onoff: 0, brightness: 80, master_brightness: 100 }
        : { onoff: 0, hue: 0, saturation: 0, lightness: 50, cct: 4000, cct_brightness: 80 },
  }
})

export const mockVariables = {
  Information: {
    info: {
      gateway_id: 'HYP-GW-HT-CDE15C',
      name: 'HYP-GW-HT_C4_0E_04',
      product_id: 'HYP-GW-HT',
      model_number: 'HYP-GW-HT-1125-R01',
      manufacturer: 'Hypnotik',
      mac: '3C:0F:02:C4:0E:06',
      chip: 'esp32s3',
      os: 'FreeRTOS-V10.5.1',
      fw_version: 'v1.0.1',
      commit_hash: 'c007629',
      hw_version: 'v1.0.0',
      serial: '1',
      date_of_manufacture: 'Apr 30, 2026',
      gw_provisioned: true,
      bleEnabled: true,
      network: {
        wifi: { ssid: 'NDS-TPL-2.4G', connected: true, ip: '192.168.0.199', gw: '192.168.0.1', mask: '255.255.255.0' },
        ethernet: { connected: true, ip: '192.168.1.149', gw: '192.168.1.1', mask: '255.255.255.0' },
        discovery_method: { mdns: { hostname: 'HYP-GW-HT_C4_0E_04' } },
      },
      location: { region: 'Kathmandu/Nepal', timezone: '+0545', latitude: 27.7172, longitude: 85.324, address: 'Kathmandu' },
    },
    status: {
      gw_provisioned: true,
      bleEnabled: true,
      uptime: (2 * 86400 + 6 * 3600 + 20 * 60 + 45) * 1e6,
      memory: { free_heap: 208164, free_iram: 102400, free_psram: 3145728 },
    },
  },

  Nodes: nodes,

  Groups: [
    {
      group_id: 'living-room',
      group_name: 'Living Room',
      group_addr: 0xc001,
      type: 'light',
      nodes: [nodes[1].id, nodes[2].id],
      state: { onoff: 1, brightness: 80, cct: 4000, hue: 0, saturation: 0, lightness: 50 },
    },
    {
      group_id: 'bedroom',
      group_name: 'Bedroom',
      group_addr: 0xc002,
      type: 'light',
      nodes: [nodes[3].id],
      state: { onoff: 1, brightness: 80, cct: 4000, hue: 0, saturation: 0, lightness: 50 },
    },
  ],

  Scenes: [
    { scene_id: 'movie-night', scene_name: 'Movie Night', scene_number: 1, nodes: [nodes[1].id, nodes[2].id] },
    { scene_id: 'morning', scene_name: 'Morning', scene_number: 2, nodes: [nodes[4].id, nodes[3].id, nodes[5].id] },
  ],
}
