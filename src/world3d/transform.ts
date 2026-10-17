/**
 * Writes a position, a rotation (Euler angles applied yaw, then pitch, then roll: Three.js 'YXZ') and a
 * scale straight into the column-major 4×4 matrix at arr[o]. Same result as Matrix4.compose() with a
 * quaternion made from the Euler angles, without the quaternion in between: this runs every frame for
 * every tumbling body, staggering zombie and flying chunk.
 */
export function writeTransform(
  arr: Float32Array,
  o: number,
  x: number,
  y: number,
  z: number,
  pitch: number,
  yaw: number,
  roll: number,
  sx: number,
  sy: number,
  sz: number,
): void {
  const a = Math.cos(pitch);
  const b = Math.sin(pitch);
  const c = Math.cos(yaw);
  const d = Math.sin(yaw);
  const e = Math.cos(roll);
  const f = Math.sin(roll);
  const ce = c * e;
  const cf = c * f;
  const de = d * e;
  const df = d * f;
  arr[o] = (ce + df * b) * sx;
  arr[o + 1] = a * f * sx;
  arr[o + 2] = (cf * b - de) * sx;
  arr[o + 3] = 0;
  arr[o + 4] = (de * b - cf) * sy;
  arr[o + 5] = a * e * sy;
  arr[o + 6] = (df + ce * b) * sy;
  arr[o + 7] = 0;
  arr[o + 8] = a * d * sz;
  arr[o + 9] = -b * sz;
  arr[o + 10] = a * c * sz;
  arr[o + 11] = 0;
  arr[o + 12] = x;
  arr[o + 13] = y;
  arr[o + 14] = z;
  arr[o + 15] = 1;
}
