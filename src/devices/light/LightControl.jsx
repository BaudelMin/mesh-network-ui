import { OnOff } from '../../components/ui.jsx'
import { fromDeg, fromPct, toDeg, toPct } from './hsl.js'

function Slider({ label, value, min, max, step = 1, display, track, disabled, onChange }) {
  return (
    <label className={`slider ${disabled ? 'disabled' : ''}`}>
      <span className="slider-label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        style={track ? { '--track': track } : undefined}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="slider-value mono">{display}</span>
    </label>
  )
}

// Brightness/CCT put the light in CCT mode; hue/saturation/lightness put it in HSL mode.
export default function LightControl({ state, disabled, onChange }) {
  const hue = toDeg(state.hsl.h)
  const sat = toPct(state.hsl.s)
  const light = toPct(state.hsl.l)
  const setHsl = (patch) => onChange({ mode: 'hsl', hsl: { ...state.hsl, ...patch } })

  return (
    <>
      <div className="slider-row">
        <span className="slider-label">Power</span>
        <OnOff on={state.on} disabled={disabled} onChange={(on) => onChange({ on })} />
      </div>
      <Slider
        label="Brightness"
        value={state.brightness}
        min={0}
        max={100}
        display={`${state.brightness}%`}
        disabled={disabled}
        onChange={(brightness) => onChange({ brightness, mode: 'cct' })}
      />
      <Slider
        label="CCT"
        value={state.cct}
        min={2700}
        max={6500}
        step={100}
        display={`${state.cct} K`}
        track="linear-gradient(90deg, #ffb46b, #fff4e6, #cfe0ff)"
        disabled={disabled}
        onChange={(cct) => onChange({ cct, mode: 'cct' })}
      />
      <Slider
        label="Hue"
        value={hue}
        min={0}
        max={360}
        display={`${hue}°`}
        track="linear-gradient(90deg, red, #ff0, lime, cyan, blue, #f0f, red)"
        disabled={disabled}
        onChange={(d) => setHsl({ h: fromDeg(d) })}
      />
      <Slider
        label="Saturation"
        value={sat}
        min={0}
        max={100}
        display={`${sat}%`}
        track={`linear-gradient(90deg, hsl(${hue} 0% 50%), hsl(${hue} 100% 50%))`}
        disabled={disabled}
        onChange={(p) => setHsl({ s: fromPct(p) })}
      />
      <Slider
        label="Lightness"
        value={light}
        min={0}
        max={100}
        display={`${light}%`}
        track={`linear-gradient(90deg, #000, hsl(${hue} ${sat}% 50%), #fff)`}
        disabled={disabled}
        onChange={(p) => setHsl({ l: fromPct(p) })}
      />
    </>
  )
}
