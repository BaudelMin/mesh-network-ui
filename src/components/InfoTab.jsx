import { AlertIcon, RefreshIcon } from './icons.jsx'
import { Card, Chip, ReadOnly } from './ui.jsx'

const bytes = (n) => `${n.toLocaleString('en-US')} B`

function formatUptime(total) {
  const d = Math.floor(total / 86400)
  const h = Math.floor((total % 86400) / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n) => String(n).padStart(2, '0')
  return `${d}d ${pad(h)}:${pad(m)}:${pad(s)}`
}

export default function InfoTab({ gateway, busy, onRestart, onFactoryReset }) {
  const { identity: id, runtime: rt, network: net, location: loc } = gateway

  return (
    <div className="grid-2">
      <Card
        title="Gateway Identity"
        subtitle="From the Information variable — identity and firmware/hardware details."
      >
        <div className="grid-2 fields">
          <ReadOnly label="Name" value={id.name} />
          <ReadOnly label="Product ID" value={id.productId} />
          <ReadOnly label="Manufacturer" value={id.manufacturer} />
          <ReadOnly label="MAC" value={id.mac} />
          <ReadOnly label="Chip / OS" value={id.chipOs} />
          <ReadOnly label="FW / HW Version" value={id.fwHw} />
          <ReadOnly label="Serial" value={id.serial} />
          <ReadOnly label="Date of Manufacture" value={id.manufactured} />
        </div>
        <div className="chips">
          {id.provisioned && <Chip tone="green">● Provisioned</Chip>}
          {id.bleMesh && <Chip tone="green">● BLE Mesh Enabled</Chip>}
        </div>
      </Card>

      <Card
        title="Runtime Status"
        subtitle="From the Information variable — kept current by the driver as the gateway reports status."
      >
        <div className="grid-2 fields">
          <ReadOnly label="Uptime" value={formatUptime(rt.uptimeSeconds)} />
          <ReadOnly label="Free Heap" value={bytes(rt.freeHeap)} />
          <ReadOnly label="Free IRAM" value={bytes(rt.freeIram)} />
          <ReadOnly label="Free PSRAM" value={bytes(rt.freePsram)} />
        </div>
      </Card>

      <Card title="Network">
        <div className="grid-2 fields">
          <ReadOnly label="WiFi SSID" value={`${net.wifiSsid} · ${net.wifiStatus}`} />
          <ReadOnly label="WiFi IP" value={net.wifiIp} />
          <ReadOnly label="Ethernet" value={`${net.ethernetStatus} · ${net.ethernetIp}`} />
          <ReadOnly label="mDNS / SDDP host" value={net.host} />
        </div>
      </Card>

      <Card title="Location">
        <div className="grid-2 fields">
          <ReadOnly label="Region" value={loc.region} />
          <ReadOnly label="Timezone" value={loc.timezone} />
          <ReadOnly label="Coordinates" value={loc.coordinates} />
          <ReadOnly label="Address" value={loc.address} />
        </div>
      </Card>

      <Card
        className="span-2"
        title="Gateway Actions"
        subtitle="Gateway.RESTART — disabled while any HT Mesh operation or node OTA is in progress."
      >
        <div className="row">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={onRestart}>
            <RefreshIcon /> Restart (soft)
          </button>
          <button type="button" className="btn btn-outline" disabled={busy} onClick={onFactoryReset}>
            <AlertIcon /> Factory Reset
          </button>
        </div>
      </Card>
    </div>
  )
}
