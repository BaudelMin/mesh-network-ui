import { useEffect, useRef, useState } from 'react'

// How long the Confirm step waits for a second click before going back.
export const CONFIRM_WINDOW_MS = 5000

const progress = (ms) => ({ '--progress-ms': `${ms}ms` })

/*
 * Two-step action button (no popup). The first click turns it into a Confirm
 * button for CONFIRM_WINDOW_MS, with a bar showing the time left; clicking
 * Confirm runs onConfirm, otherwise it goes back to the first button. While
 * `busy`, it shows a spinner, `busyLabel` and a bar filling over `busyMs`.
 */
export default function ConfirmButton({ className, icon, label, confirmLabel = 'Confirm', busy, busyLabel, busyMs, disabled, onConfirm }) {
  const [armed, setArmed] = useState(false)
  const timer = useRef()

  useEffect(() => () => clearTimeout(timer.current), [])

  const arm = () => {
    setArmed(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setArmed(false), CONFIRM_WINDOW_MS)
  }

  const confirm = () => {
    clearTimeout(timer.current)
    setArmed(false)
    onConfirm()
  }

  if (busy) {
    // key: remount so the progress animation restarts from empty
    return (
      <button key="busy" type="button" className={`btn ${className} btn-progress`} style={progress(busyMs)} disabled aria-busy>
        <span className="spin">{icon}</span> {busyLabel}
      </button>
    )
  }

  if (armed && !disabled) {
    return (
      <button
        key="confirm"
        type="button"
        className="btn btn-confirm btn-progress"
        style={progress(CONFIRM_WINDOW_MS)}
        // oxlint-disable-next-line jsx-a11y/no-autofocus -- keep keyboard focus on the button that replaced the one just pressed
        autoFocus
        onClick={confirm}
      >
        {icon} {confirmLabel}
      </button>
    )
  }

  return (
    <button key="idle" type="button" className={`btn ${className}`} disabled={disabled} onClick={arm}>
      {icon} {label}
    </button>
  )
}
