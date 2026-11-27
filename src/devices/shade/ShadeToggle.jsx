import { isMoving, toggleAction } from './motion.js'
import ShadeVisual from './ShadeVisual.jsx'

const LABELS = { stop: 'Stop', close: 'Close', open: 'Open' }

// Shade card control: an animated mini shade in place of the power switch.
export default function ShadeToggle({ name, shade, disabled, onAction }) {
  const action = toggleAction(shade)
  return (
    <button
      type="button"
      className={`shade-toggle ${isMoving(shade) ? 'moving' : ''}`}
      disabled={disabled}
      aria-label={`${LABELS[action]} ${name}`}
      title={disabled ? 'Offline' : `${LABELS[action]} shade`}
      onClick={() => onAction(action)}
    >
      <ShadeVisual shade={shade} size="sm" />
    </button>
  )
}
