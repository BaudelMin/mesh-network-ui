function Switch({ on, disabled, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`switch ${on ? 'on' : ''}`}
      disabled={disabled}
      onClick={() => onChange(!on)}
    >
      <span className="switch-knob" />
    </button>
  )
}

// Compact card for a node or group: power switch + name + one meta line. Click selects it.
// `control` replaces the power switch (shades use an open / close toggle).
export default function EntityCard({ name, on, disabled, selected, onToggle, onSelect, control, children }) {
  return (
    <article className={`entity-card ${selected ? 'selected' : ''}`}>
      {control ?? <Switch on={on} disabled={disabled} label={`Power ${name}`} onChange={onToggle} />}
      <button type="button" className="entity-card-body" onClick={onSelect} aria-pressed={selected}>
        <span className="entity-card-name">{name}</span>
        <span className="entity-card-meta">{children}</span>
      </button>
    </article>
  )
}
