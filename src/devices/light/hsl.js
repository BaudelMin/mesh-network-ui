// HSL in panel ranges: hue 0–360°, saturation/lightness 0–100%.
// Conversion to BLE Mesh 16-bit values happens in the Lua driver.
export const cssColor = ({ h, s, l }) => `hsl(${h} ${s}% ${l}%)`
