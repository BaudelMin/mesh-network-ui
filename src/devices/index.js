import LightControl from './light/LightControl.jsx'
import lightStatus from './light/lightStatus.js'

/*
 * Device type registry. Nodes and groups pick their control + status UI by `type`.
 *
 * To add a device type (e.g. blinds):
 *   1. Create src/devices/<type>/ with a Control component and a status function.
 *        Control: ({ state, disabled, onChange(patch) }) => JSX
 *        status:  (state) => [{ label, value, swatch? }]
 *   2. Register it below.
 */
export const DEVICE_TYPES = {
  light: { label: 'Light', Control: LightControl, status: lightStatus },
}

export const getDeviceType = (type) => DEVICE_TYPES[type] ?? null

export const typeLabel = (type) => DEVICE_TYPES[type]?.label ?? type
