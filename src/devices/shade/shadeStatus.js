import { EMPTY_SHADE_STATE } from '../../api/adapters.js'

const MOVING = { none: 'Stopped', opening: 'Opening', closing: 'Closing', moving: 'Moving' }
const limit = (v) => (v === undefined ? undefined : v ? 'set' : 'not set')

// Status rows for a shade node. Only what the shade has reported is shown.
export default function shadeStatus(node) {
  const s = node.shade ?? EMPTY_SHADE_STATE
  const calibration =
    s.openLimitSet === undefined && s.closeLimitSet === undefined
      ? undefined
      : s.openLimitSet && s.closeLimitSet
        ? 'Calibrated'
        : `Not calibrated (open ${limit(s.openLimitSet) ?? '?'}, close ${limit(s.closeLimitSet) ?? '?'})`
  const rows = [
    { label: 'State', value: MOVING[s.moving] ?? s.moving },
    { label: 'Position', value: s.position === undefined ? 'unknown' : `${s.position}% open` },
    { label: 'Target', value: s.moving !== 'none' && s.target !== undefined ? `${s.target}%` : undefined },
    { label: 'Favorite', value: s.favorite !== undefined ? `${s.favorite}%` : s.favoriteSet ? 'set (from remote)' : s.favoriteSet === false ? 'not set' : undefined },
    { label: 'Calibration', value: calibration },
  ]
  return rows.filter((r) => r.value !== undefined)
}
