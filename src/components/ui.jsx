export function Card({ title, subtitle, action, children, className = '' }) {
  return (
    <section className={`card ${className}`}>
      <header className="card-head">
        <div>
          <h2 className="card-title">{title}</h2>
          {subtitle && <p className="card-subtitle">{subtitle}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  )
}

export function ReadOnly({ label, value }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <span className="field-box mono">{value}</span>
    </div>
  )
}

export function OnOff({ on, disabled, onChange }) {
  return (
    <div className="onoff">
      <button
        type="button"
        className={`btn btn-sm ${on && !disabled ? 'btn-primary' : 'btn-plain'}`}
        disabled={disabled}
        onClick={() => onChange(true)}
      >
        On
      </button>
      <button
        type="button"
        className={`btn btn-sm ${!on && !disabled ? 'btn-dark' : 'btn-plain'}`}
        disabled={disabled}
        onClick={() => onChange(false)}
      >
        Off
      </button>
    </div>
  )
}

export function Chip({ children, tone = 'purple' }) {
  return <span className={`chip chip-${tone}`}>{children}</span>
}
