import { EMPTY_SHADE_STATE } from '../../api/adapters.js'
import ConfirmButton from '../../components/ConfirmButton.jsx'
import { AlertIcon, ChevronDownIcon, ChevronUpIcon, StopIcon } from '../../components/icons.jsx'
import { Slider } from '../light/LightControl.jsx'
import { describeShade, isMoving } from './motion.js'
import ShadeVisual from './ShadeVisual.jsx'

// Everyday actions, shown as text buttons.
const ACTIONS = [
  { action: 'favorite', label: 'Favorite' },
  { action: 'toggle', label: 'Toggle' },
  { action: 'jog_up', label: 'Jog up' },
  { action: 'jog_down', label: 'Jog down' },
  { action: 'state', label: 'Read state' },
]

// Installer actions: limits, favorite, direction.
const SETUP = [
  { action: 'calib_open', label: 'Run to open limit' },
  { action: 'calib_close', label: 'Run to close limit' },
  { action: 'set_open_limit', label: 'Set open limit' },
  { action: 'set_close_limit', label: 'Set close limit' },
  { action: 'set_favorite', label: 'Set favorite' },
  { action: 'clear_open_limit', label: 'Clear open limit' },
  { action: 'clear_close_limit', label: 'Clear close limit' },
  { action: 'clear_favorite', label: 'Clear favorite' },
  { action: 'direction', label: 'Direction: normal', reversed: false },
  { action: 'direction', label: 'Direction: reversed', reversed: true },
]

/*
 * Control for a shade node (product_id HYP-SH-*). onChange patches are
 *   { shadeAction, position? , reversed? }
 * and go out as Node.SHADE through SetDeviceState (useGateway → shadeRequest).
 * Stop is enabled only while the shade is moving (see motion.js for which
 * actions start a move).
 */
export default function ShadeControl({ state, disabled, onChange }) {
  const shade = state.shade ?? EMPTY_SHADE_STATE
  const moving = isMoving(shade)
  const send = (shadeAction, extra = {}) => onChange({ shadeAction, ...extra })
  const sliderValue = (moving ? shade.target : undefined) ?? shade.position ?? 0

  return (
    <>
      <div className="shade-hero">
        <ShadeVisual shade={shade} />
        <div className="shade-hero-text">
          <strong>{describeShade(shade)}</strong>
          {shade.position !== undefined && <span className="muted small">Position {shade.position}% open</span>}
        </div>
      </div>

      <div className="slider-row">
        <span className="slider-label">Move</span>
        <div className="shade-move">
          <button type="button" className="btn btn-primary btn-sm" disabled={disabled} onClick={() => send('open')}>
            <ChevronUpIcon /> Open
          </button>
          <button type="button" className="btn btn-dark btn-sm" disabled={disabled} onClick={() => send('close')}>
            <ChevronDownIcon /> Close
          </button>
          <button
            type="button"
            className="btn btn-plain btn-sm shade-stop"
            disabled={disabled || !moving}
            title={moving ? 'Stop the shade' : 'Available while the shade is moving'}
            onClick={() => send('stop')}
          >
            <StopIcon /> Stop
          </button>
        </div>
      </div>

      <Slider
        label="Position"
        value={sliderValue}
        min={0}
        max={100}
        display={`${sliderValue}%`}
        track="linear-gradient(90deg, #4a4552, #e8e4ee)"
        disabled={disabled}
        onChange={(position) => send('position', { position })}
      />

      <div className="slider-row">
        <span className="slider-label">Actions</span>
        <div className="shade-actions">
          {ACTIONS.map(({ action, label }) => (
            <button key={action} type="button" className="btn btn-plain btn-sm" disabled={disabled} onClick={() => send(action)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <details className="shade-setup">
        <summary>Setup &amp; calibration</summary>
        <div className="shade-actions">
          {SETUP.map(({ action, label, reversed }) => (
            <button
              key={label}
              type="button"
              className="btn btn-plain btn-sm"
              disabled={disabled}
              onClick={() => send(action, reversed === undefined ? {} : { reversed })}
            >
              {label}
            </button>
          ))}
          <ConfirmButton className="btn-outline btn-sm" icon={<AlertIcon />} label="Clear all limits" disabled={disabled} onConfirm={() => send('clear_limits')} />
          <ConfirmButton className="btn-outline btn-sm" icon={<AlertIcon />} label="Factory reset shade" disabled={disabled} onConfirm={() => send('factory_reset')} />
        </div>
      </details>
    </>
  )
}
