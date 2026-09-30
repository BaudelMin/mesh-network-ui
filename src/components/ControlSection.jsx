import { getDeviceType } from '../devices/index.js'
import { Card } from './ui.jsx'

function StatusList({ rows }) {
  return (
    <dl className="status-list">
      {rows.map(({ label, value, swatch }) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd className="mono">
            {swatch && <span className="swatch" style={{ background: swatch }} />}
            {value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/*
 * Control (left) + Status (right) for one node or group. The UI inside both
 * panels comes from the device registry, chosen by `target.type`.
 *
 *   target        the selected node/group, or null
 *   info          entity-specific status rows shown before the device rows
 *   online        connection state for the status dot; omit for groups
 *   disabledNote  when set, controls are disabled and this note is shown
 */
export default function ControlSection({ title, subtitle, target, info = [], online, disabledNote, emptyText, onChange }) {
  const device = target && getDeviceType(target.type)

  let control
  let status
  if (!target) {
    control = <p className="empty">{emptyText}</p>
    status = <p className="empty">Nothing selected.</p>
  } else if (!device) {
    control = <p className="empty">No control UI for device type “{target.type}” yet.</p>
    status = <StatusList rows={info} />
  } else {
    const { Control } = device
    control = (
      <>
        {disabledNote && <p className="empty">{disabledNote}</p>}
        <Control state={target} disabled={Boolean(disabledNote)} onChange={onChange} />
      </>
    )
    status = <StatusList rows={[...info, ...device.status(target)]} />
  }

  return (
    <Card title={target ? `${title} — ${target.name}` : title} subtitle={subtitle}>
      <div className="split">
        <div className="panel">
          <h3 className="panel-title">Control</h3>
          {control}
        </div>
        <div className="panel">
          <h3 className="panel-title">
            Status
            {target && online !== undefined && <span className={`dot ${online ? 'dot-on' : 'dot-bad'}`} />}
          </h3>
          {status}
        </div>
      </div>
    </Card>
  )
}
