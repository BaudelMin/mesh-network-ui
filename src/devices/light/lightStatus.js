import { cssColor } from './hsl.js'

const MODES = { 1: '1 · single channel', 2: '2 · CCT / HSL' }

// Status rows for a light (node or group). Only fields the device reports are shown.
export default function lightStatus(state) {
  const rows = [
    { label: 'Power', value: state.on === undefined ? undefined : state.on ? 'ON' : 'OFF' },
    { label: 'Mode', value: state.mode === undefined ? undefined : MODES[state.mode] ?? String(state.mode) },
    { label: 'Brightness', value: state.brightness === undefined ? undefined : `${state.brightness}%` },
    { label: 'Master brightness', value: state.masterBrightness === undefined ? undefined : `${state.masterBrightness}%` },
    { label: 'CCT', value: state.cct === undefined ? undefined : `${state.cct} K` },
    { label: 'CCT brightness', value: state.cctBrightness === undefined ? undefined : `${state.cctBrightness}%` },
    {
      label: 'HSL',
      value: state.hsl && `${state.hsl.h}° · ${state.hsl.s}% · ${state.hsl.l}%`,
      swatch: state.hsl && cssColor(state.hsl),
    },
  ]
  return rows.filter((r) => r.value !== undefined)
}
