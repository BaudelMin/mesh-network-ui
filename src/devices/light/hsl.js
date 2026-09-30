// HSL is stored as BLE Mesh 16-bit values (0–65535); the UI shows degrees / percent.
const MAX16 = 65535

export const toDeg = (v) => Math.round((v / MAX16) * 360)
export const toPct = (v) => Math.round((v / MAX16) * 100)
export const fromDeg = (d) => Math.round((d / 360) * MAX16)
export const fromPct = (p) => Math.round((p / 100) * MAX16)

export const cssColor = ({ h, s, l }) => `hsl(${toDeg(h)} ${toPct(s)}% ${toPct(l)}%)`
