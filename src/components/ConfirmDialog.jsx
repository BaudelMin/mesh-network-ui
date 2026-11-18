import { useEffect, useId, useRef } from 'react'
import { AlertIcon } from './icons.jsx'

/*
 * Modal confirmation in the panel's own style (replaces window.confirm).
 * Esc, the Cancel button and a click on the backdrop all cancel. Focus starts
 * on Cancel, so pressing Enter by accident never runs the action, and Tab
 * stays inside the dialog while it is open.
 */
export default function ConfirmDialog({ title, children, confirmLabel, cancelLabel = 'Cancel', icon = <AlertIcon />, onConfirm, onCancel }) {
  const titleId = useId()
  const bodyId = useId()
  const dialog = useRef(null)
  const cancel = useRef(null)

  useEffect(() => {
    const previous = document.activeElement
    cancel.current?.focus()
    return () => previous?.focus?.()
  }, [])

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onCancel()
      return
    }
    if (e.key !== 'Tab') return
    const buttons = dialog.current.querySelectorAll('button:not(:disabled)')
    const first = buttons[0]
    const last = buttons[buttons.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div
        ref={dialog}
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        onKeyDown={onKeyDown}
      >
        <div className="dialog-head">
          <span className="dialog-icon">{icon}</span>
          <h2 id={titleId} className="dialog-title">{title}</h2>
        </div>
        <div id={bodyId} className="dialog-body">{children}</div>
        <div className="dialog-actions">
          <button ref={cancel} type="button" className="btn btn-plain" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className="btn btn-primary" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
