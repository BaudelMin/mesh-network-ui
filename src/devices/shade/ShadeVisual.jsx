import { useState } from 'react'

const cover = (p) => `${100 - p}%`

// The animated fabric for one move. Keyed by the move's start, so it mounts once
// per move; a negative delay resumes a move already under way (e.g. when another
// node was selected meanwhile).
function MovingBlind({ motion }) {
  const [mountedAt] = useState(() => Date.now())
  const style = {
    '--from': cover(motion.from),
    '--to': cover(motion.target),
    '--dur': `${motion.durationMs}ms`,
    '--delay': `${-Math.min(mountedAt - motion.startedAt, motion.durationMs)}ms`,
  }
  return (
    <span className="shade-blind animating" style={style}>
      <span className="shade-rail" />
    </span>
  )
}

/*
 * A window with the shade fabric drawn from the top: covered % = 100 - position.
 * A move the panel started animates over the estimated travel time (motion.js);
 * a move the driver reports glides between its position reads; a move with no
 * known position pulses; an unknown position shows hatched at half.
 */
export default function ShadeVisual({ shade, size = 'lg' }) {
  const m = shade?.motion
  const animating = m && m.moving !== 'none' && m.target !== undefined && m.from !== undefined
  const moving = shade && shade.moving !== 'none'
  const unknown = shade?.position === undefined

  let blind
  if (animating) {
    blind = <MovingBlind key={m.startedAt} motion={m} />
  } else {
    // Moving as the driver reports it: glide between its position reads; with no
    // position to show, pulse.
    const tracking = moving && !unknown
    const className = `shade-blind${tracking ? ' tracking' : moving ? ' pulsing' : unknown ? ' unknown' : ''}`
    const height = unknown ? '50%' : cover(shade.position)
    blind = (
      <span className={className} style={{ height }}>
        <span className="shade-rail" />
      </span>
    )
  }

  return (
    <span className={`shade-window shade-${size}`} aria-hidden="true">
      {blind}
    </span>
  )
}
