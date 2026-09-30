import { cssColor, toDeg, toPct } from './hsl.js'

// Status rows for a light (node or group). `swatch` renders a colour chip next to the value.
export default function lightStatus(state) {
  const { h, s, l } = state.hsl
  return [
    { label: 'Power', value: state.on ? 'ON' : 'OFF' },
    { label: 'Mode', value: state.mode.toUpperCase() },
    { label: 'Brightness', value: `${state.brightness}%` },
    { label: 'CCT', value: `${state.cct} K` },
    {
      label: 'HSL',
      value: `${toDeg(h)}° · ${toPct(s)}% · ${toPct(l)}%  (H${h} S${s} L${l})`,
      swatch: state.mode === 'hsl' ? cssColor(state.hsl) : null,
    },
  ]
}
