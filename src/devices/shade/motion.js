/*
 * Shade motion, as the panel shows it between the command and the driver's
 * answer.
 *
 * A shade reports `moving` (none | opening | closing) only when the driver reads
 * its state; the node never says when a move ends (the shade driver polls
 * Node.SHADE "state" every 2 s). So the panel starts a local motion when it sends
 * an action that moves the shade, animates it at an estimated speed, and lets
 * the driver's state take over as soon as it arrives (useGateway reconcileMotion).
 *
 * Which actions move the shade (and so enable Stop):
 *   open, close          -> to 100 / 0
 *   position, favorite   -> to that position (none if already there)
 *   toggle               -> firmware cycles Open -> Stop -> Close -> Stop: stops a
 *                           moving shade, otherwise moves (direction guessed from
 *                           the position)
 *   calib_open/_close    -> runs to the end until stopped (no target)
 * jog_up / jog_down are a short step, and limits / favorite / direction / state /
 * factory_reset don't move it: none of those enable Stop.
 *
 * A motion is { moving, from, target, startedAt, durationMs }; once settled it is
 * { moving: 'none', position, settledAt }.
 */

// Estimated travel speed: full open <-> close in about 30 s.
export const MS_PER_PERCENT = 300
// A move with no known end (calibration run, unknown favorite) is assumed over after this.
export const MAX_MOVE_MS = 60000

export const STOP = 'stop'

export const isMoving = (shade) => Boolean(shade) && shade.moving !== 'none'

// "Open", "Closing… → 40%", "Position unknown": one line for cards and Node Control.
export function describeShade(shade) {
  if (shade.moving !== 'none') {
    const verb = shade.moving === 'opening' ? 'Opening…' : shade.moving === 'closing' ? 'Closing…' : 'Moving…'
    return shade.target !== undefined ? `${verb} → ${shade.target}%` : verb
  }
  if (shade.position === undefined) return 'Position unknown'
  if (shade.position >= 100) return 'Open'
  if (shade.position <= 0) return 'Closed'
  return `${shade.position}% open`
}

// The card's one-click toggle: stop a moving shade, otherwise close one that is
// mostly open and open one that is mostly closed (or whose position is unknown).
export function toggleAction(shade) {
  if (isMoving(shade)) return 'stop'
  return shade?.position !== undefined && shade.position >= 50 ? 'close' : 'open'
}

// Where the shade is now (% open), including a motion in progress.
export function currentPosition(shade, now = Date.now()) {
  const m = shade?.motion
  if (!m || m.moving === 'none' || m.target === undefined || m.from === undefined) return shade?.position
  const done = Math.min(1, (now - m.startedAt) / m.durationMs)
  return Math.round(m.from + (m.target - m.from) * done)
}

function moveTo(position, target, now) {
  if (position !== undefined && position === target) return null // already there
  const moving = position === undefined ? (target >= 50 ? 'opening' : 'closing') : target > position ? 'opening' : 'closing'
  const from = position ?? (moving === 'opening' ? 0 : 100)
  return { moving, from, target, startedAt: now, durationMs: Math.max(1500, Math.abs(target - from) * MS_PER_PERCENT) }
}

// Runs until stopped: animate towards the end it is heading for.
function run(moving, position, now) {
  const target = moving === 'opening' ? 100 : moving === 'closing' ? 0 : undefined
  const from = position ?? 50
  const durationMs = target === undefined ? MAX_MOVE_MS : Math.max(1500, Math.abs(target - from) * MS_PER_PERCENT)
  return { moving, from, target, startedAt: now, durationMs, open: true }
}

// The motion an action starts: a motion object, STOP, or null (no change).
export function startMotion(shade, action, value, now = Date.now()) {
  const position = currentPosition(shade, now)
  switch (action) {
    case 'open': return moveTo(position, 100, now)
    case 'close': return moveTo(position, 0, now)
    case 'position': return moveTo(position, value, now)
    case 'favorite':
      return shade?.favorite !== undefined ? moveTo(position, shade.favorite, now) : run('moving', position, now)
    case 'toggle':
      if (isMoving(shade)) return STOP
      return position === undefined ? run('moving', position, now) : moveTo(position, position >= 50 ? 0 : 100, now)
    case 'calib_open': return run('opening', position, now)
    case 'calib_close': return run('closing', position, now)
    case 'stop': return STOP
    default: return null
  }
}

// Stopping: settle where the animation says the shade is now.
export const settleAt = (position, now = Date.now()) => ({ moving: 'none', position, settledAt: now })

// The shade as displayed: driver state with the local motion on top.
export function applyMotion(shade, motion) {
  if (!motion) return shade
  if (motion.moving !== 'none') return { ...shade, moving: motion.moving, target: motion.target, motion }
  return { ...shade, moving: 'none', target: undefined, position: motion.position ?? shade.position, motion }
}

/*
 * A new Nodes value arrived: keep a local motion only while the driver has
 * nothing newer. Every motion records `base`, the driver's position when the
 * command was sent. The driver wins when
 *   - it reports the shade moving, or
 *   - its position is no longer `base` (it has read the shade since).
 * A Nodes write for another node still carries the old position, so it doesn't
 * make the shade jump back.
 */
export function reconcileMotion(motion, nodes) {
  let changed = false
  const next = { ...motion }
  for (const n of nodes) {
    const m = next[n.id]
    if (!m || !n.shade) continue
    if (n.shade.moving !== 'none' || n.shade.position !== m.base) {
      delete next[n.id]
      changed = true
    }
  }
  return changed ? next : motion
}
