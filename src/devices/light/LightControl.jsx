import { OnOff } from '../../components/ui.jsx'

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

/*
 * Controls follow the light's API mode:
 *   mode 1  single brightness channel  -> Power, Brightness
 *   mode 2  separate CCT/HSL channels  -> Power, CCT, Hue, Saturation, Lightness
 *   unknown (e.g. groups)              -> everything
 * onChange patches: { on } | { brightness } | { cct } | { hsl: { h, s, l } }
 */
export default function LightControl({ state, disabled, onChange }) {
  const showBrightness = state.mode !== 2
  const showColor = state.mode !== 1
  const brightness = state.brightness ?? 0
  const cct = state.cct ?? 4000
  const hsl = state.hsl ?? { h: 0, s: 0, l: 0 }
  const setHsl = (patch) => onChange({ hsl: { ...hsl, ...patch } })

  return (
    <>
      <div className="slider-row">
        <span className="slider-label">Power</span>
        <OnOff on={Boolean(state.on)} disabled={disabled} onChange={(on) => onChange({ on })} />
      </div>
      {showBrightness && (
        <Slider
          label="Brightness"
          value={brightness}
          min={0}
          max={100}
          display={`${brightness}%`}
          disabled={disabled}
          onChange={(v) => onChange({ brightness: v })}
        />
      )}
      {showColor && (
        <>
          <Slider
            label="CCT"
            value={cct}
            min={2700}
            max={6500}
            step={100}
            display={`${cct} K`}
            track="linear-gradient(90deg, #ffb46b, #fff4e6, #cfe0ff)"
            disabled={disabled}
            onChange={(v) => onChange({ cct: v })}
          />
          <Slider
            label="Hue"
            value={hsl.h}
            min={0}
            max={360}
            display={`${hsl.h}°`}
            track="linear-gradient(90deg, red, #ff0, lime, cyan, blue, #f0f, red)"
            disabled={disabled}
            onChange={(v) => setHsl({ h: v })}
          />
          <Slider
            label="Saturation"
            value={hsl.s}
            min={0}
            max={100}
            display={`${hsl.s}%`}
            track={`linear-gradient(90deg, hsl(${hsl.h} 0% 50%), hsl(${hsl.h} 100% 50%))`}
            disabled={disabled}
            onChange={(v) => setHsl({ s: v })}
          />
          <Slider
            label="Lightness"
            value={hsl.l}
            min={0}
            max={100}
            display={`${hsl.l}%`}
            track={`linear-gradient(90deg, #000, hsl(${hsl.h} ${hsl.s}% 50%), #fff)`}
            disabled={disabled}
            onChange={(v) => setHsl({ l: v })}
          />
        </>
      )}
    </>
  )
}
