import * as THREE from 'three';

/**
 * Low-poly model builder. Models are boxes, tapered boxes and cylinders with one flat color per part,
 * merged into one non-indexed geometry. Lighting is baked into the vertex colors (one fixed sun), so
 * the battle draws with an unlit material: the cheapest fragment shader there is, on a phone GPU.
 *
 * Actor models also carry `aLimb` per vertex (kind, pivot y, pivot z, side) so the actor shader swings
 * legs and arms on the GPU without bones: a hundred walking units cost one draw call per model.
 */

export const enum Limb {
  None = 0,
  Leg = 1,
  /** Arm swinging opposite to the legs. */
  Arm = 2,
  /** Arm reaching forward, clawing a little (zombies). */
  Claw = 3,
  /** Nods with the walk. */
  Head = 4,
}

export interface PartOpts {
  limb?: Limb;
  /** Pivot of the limb (hip, shoulder) in model space. */
  pivotY?: number;
  pivotZ?: number;
  /** +1 / -1: left and right limbs swing in opposite phase. */
  side?: number;
  /** Not shaded by the sun: eyes, fire, glowing pustules. */
  glow?: boolean;
}

export interface BoxOpts extends PartOpts {
  /** Top face size relative to the bottom (tapered limbs, hunched shoulders). */
  taper?: number;
  /** Rotation around the x axis through (rotY, rotZ); positive tips the top forward (-z). */
  rotX?: number;
  rotY?: number;
  rotZ?: number;
  /** Rotation around the z axis through the box's own center (leaning sideways). */
  roll?: number;
}

/** Direction the sun comes from: high, a little to the left, from the camera's side of the scene. */
const SUN = new THREE.Vector3(-0.45, 0.8, 0.4).normalize();
const AMBIENT = 0.5;

const ab = new THREE.Vector3();
const ac = new THREE.Vector3();
const n = new THREE.Vector3();
const mid = new THREE.Vector3();
const color = new THREE.Color();

function shadeFor(normal: THREE.Vector3): number {
  return AMBIENT + (1 - AMBIENT) * Math.max(0, normal.dot(SUN)) + normal.y * 0.04;
}

export class GeoBuilder {
  private readonly pos: number[] = [];
  private readonly col: number[] = [];
  private readonly limb: number[] = [];

  /**
   * One triangle. The corners can come in either order: the face is turned to point away from `center`
   * (the middle of the convex part it belongs to), which fixes both back-face culling and the shading.
   */
  private tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, rgb: THREE.Color, opts: PartOpts, center: THREE.Vector3): void {
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    n.crossVectors(ab, ac);
    if (n.lengthSq() < 1e-10) return;
    n.normalize();
    mid.copy(a).add(b).add(c).multiplyScalar(1 / 3).sub(center);
    let p1 = b;
    let p2 = c;
    if (n.dot(mid) < 0) {
      n.negate();
      p1 = c;
      p2 = b;
    }
    const s = opts.glow ? 1 : shadeFor(n);
    this.pos.push(a.x, a.y, a.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
    const r = Math.min(1, rgb.r * s);
    const g = Math.min(1, rgb.g * s);
    const bl = Math.min(1, rgb.b * s);
    for (let i = 0; i < 3; i++) {
      this.col.push(r, g, bl);
      this.limb.push(opts.limb ?? 0, opts.pivotY ?? 0, opts.pivotZ ?? 0, opts.side ?? 1);
    }
  }

  private quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, rgb: THREE.Color, opts: PartOpts, center: THREE.Vector3): void {
    this.tri(a, b, c, rgb, opts, center);
    this.tri(a, c, d, rgb, opts, center);
  }

  /** Box centered on x/z with its bottom at y0, optionally tapered and tilted. */
  box(cx: number, y0: number, cz: number, w: number, h: number, d: number, hex: number, opts: BoxOpts = {}): this {
    const hw = w / 2;
    const hd = d / 2;
    const t = opts.taper ?? 1;
    const tw = hw * t;
    const td = hd * t;
    const v = [
      new THREE.Vector3(-hw, 0, -hd),
      new THREE.Vector3(hw, 0, -hd),
      new THREE.Vector3(hw, 0, hd),
      new THREE.Vector3(-hw, 0, hd),
      new THREE.Vector3(-tw, h, -td),
      new THREE.Vector3(tw, h, -td),
      new THREE.Vector3(tw, h, td),
      new THREE.Vector3(-tw, h, td),
    ];
    const center = new THREE.Vector3(0, h / 2, 0);
    const roll = opts.roll ?? 0;
    if (roll !== 0) {
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), roll);
      for (const p of v) p.sub(center).applyQuaternion(q).add(center);
    }
    for (const p of v) p.add(new THREE.Vector3(cx, y0, cz));
    center.add(new THREE.Vector3(cx, y0, cz));
    const rot = opts.rotX ?? 0;
    if (rot !== 0) {
      // Positive angles tip the box's top toward -z (forward): arms reaching out, a hunched back.
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -rot);
      const pivot = new THREE.Vector3(cx, opts.rotY ?? y0, opts.rotZ ?? cz);
      for (const p of [...v, center]) p.sub(pivot).applyQuaternion(q).add(pivot);
    }
    const c = color.setHex(hex).clone();
    this.quad(v[4], v[5], v[6], v[7], c, opts, center);
    this.quad(v[0], v[1], v[2], v[3], c, opts, center);
    this.quad(v[3], v[2], v[6], v[7], c, opts, center);
    this.quad(v[0], v[1], v[5], v[4], c, opts, center);
    this.quad(v[0], v[3], v[7], v[4], c, opts, center);
    this.quad(v[1], v[2], v[6], v[5], c, opts, center);
    return this;
  }

  /** Cylinder lying along the x axis (wheels, logs, pipes). */
  cylinderX(cx: number, cy: number, cz: number, r: number, len: number, hex: number, seg = 8, opts: PartOpts = {}): this {
    const c = color.setHex(hex).clone();
    const center = new THREE.Vector3(cx, cy, cz);
    const x0 = cx - len / 2;
    const x1 = cx + len / 2;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2;
      const a1 = ((i + 1) / seg) * Math.PI * 2;
      const y0 = cy + Math.cos(a0) * r;
      const z0 = cz + Math.sin(a0) * r;
      const y1 = cy + Math.cos(a1) * r;
      const z1 = cz + Math.sin(a1) * r;
      this.quad(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x0, y1, z1), new THREE.Vector3(x1, y1, z1), new THREE.Vector3(x1, y0, z0), c, opts, center);
      this.tri(new THREE.Vector3(x0, cy, cz), new THREE.Vector3(x0, y1, z1), new THREE.Vector3(x0, y0, z0), c, opts, center);
      this.tri(new THREE.Vector3(x1, cy, cz), new THREE.Vector3(x1, y0, z0), new THREE.Vector3(x1, y1, z1), c, opts, center);
    }
    return this;
  }

  /** Cylinder lying along the z axis (gun barrels, pipes running down the road). */
  cylinderZ(cx: number, cy: number, z0: number, z1: number, r: number, hex: number, seg = 6, opts: PartOpts = {}): this {
    const c = color.setHex(hex).clone();
    const center = new THREE.Vector3(cx, cy, (z0 + z1) / 2);
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2 + Math.PI / seg;
      const a1 = ((i + 1) / seg) * Math.PI * 2 + Math.PI / seg;
      const p0 = new THREE.Vector3(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, z0);
      const p1 = new THREE.Vector3(cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, z0);
      const p2 = new THREE.Vector3(cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, z1);
      const p3 = new THREE.Vector3(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, z1);
      this.quad(p0, p1, p2, p3, c, opts, center);
      this.tri(new THREE.Vector3(cx, cy, z0), p0, p1, c, opts, center);
      this.tri(new THREE.Vector3(cx, cy, z1), p3, p2, c, opts, center);
    }
    return this;
  }

  /** Upright cylinder or cone (barrels, posts, lamp poles, spikes when rTop is 0). */
  cylinderY(cx: number, y0: number, cz: number, r: number, h: number, hex: number, seg = 8, opts: PartOpts = {}, rTop = r): this {
    const c = color.setHex(hex).clone();
    const center = new THREE.Vector3(cx, y0 + h / 2, cz);
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2;
      const a1 = ((i + 1) / seg) * Math.PI * 2;
      const p0 = new THREE.Vector3(cx + Math.cos(a0) * r, y0, cz + Math.sin(a0) * r);
      const p1 = new THREE.Vector3(cx + Math.cos(a1) * r, y0, cz + Math.sin(a1) * r);
      const p2 = new THREE.Vector3(cx + Math.cos(a1) * rTop, y0 + h, cz + Math.sin(a1) * rTop);
      const p3 = new THREE.Vector3(cx + Math.cos(a0) * rTop, y0 + h, cz + Math.sin(a0) * rTop);
      this.quad(p0, p1, p2, p3, c, opts, center);
      if (rTop > 0.01) this.tri(new THREE.Vector3(cx, y0 + h, cz), p2, p3, c, opts, center);
    }
    return this;
  }

  /** Flat quad on the ground facing up (road marks, puddles), rotated around y. */
  flat(cx: number, y: number, cz: number, w: number, d: number, hex: number, rot = 0, glow = false): this {
    const c = color.setHex(hex).clone();
    const cs = Math.cos(rot);
    const sn = Math.sin(rot);
    const pt = (dx: number, dz: number) => new THREE.Vector3(cx + dx * cs - dz * sn, y, cz + dx * sn + dz * cs);
    const below = new THREE.Vector3(cx, y - 1, cz);
    this.quad(pt(-w / 2, -d / 2), pt(w / 2, -d / 2), pt(w / 2, d / 2), pt(-w / 2, d / 2), c, { glow }, below);
    return this;
  }

  /** Irregular flat polygon on the ground (oil stains, rubble patches). */
  blob(cx: number, y: number, cz: number, r: number, hex: number, rand: () => number, sides = 7): this {
    const c = color.setHex(hex).clone();
    const center = new THREE.Vector3(cx, y, cz);
    const below = new THREE.Vector3(cx, y - 1, cz);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      const rr = r * (0.6 + rand() * 0.5);
      pts.push(new THREE.Vector3(cx + Math.cos(a) * rr, y, cz + Math.sin(a) * rr));
    }
    for (let i = 0; i < sides; i++) this.tri(center, pts[(i + 1) % sides], pts[i], c, {}, below);
    return this;
  }

  /** Vertical quad facing +z (signs, glass panes), two-sided by adding both faces. */
  pane(cx: number, y0: number, cz: number, w: number, h: number, hex: number, glow = false): this {
    const c = color.setHex(hex).clone();
    const a = new THREE.Vector3(cx - w / 2, y0, cz);
    const b = new THREE.Vector3(cx + w / 2, y0, cz);
    const cc = new THREE.Vector3(cx + w / 2, y0 + h, cz);
    const d = new THREE.Vector3(cx - w / 2, y0 + h, cz);
    this.quad(a, b, cc, d, c, { glow }, new THREE.Vector3(cx, y0 + h / 2, cz - 1));
    this.quad(a, b, cc, d, c, { glow }, new THREE.Vector3(cx, y0 + h / 2, cz + 1));
    return this;
  }

  /** One-sided vertical quad in the y-z plane at x, facing +x (facing = 1) or -x (windows, signs). */
  paneX(x: number, y0: number, cz: number, d: number, h: number, hex: number, facing: number, glow = false): this {
    const c = color.setHex(hex).clone();
    const a = new THREE.Vector3(x, y0, cz - d / 2);
    const b = new THREE.Vector3(x, y0, cz + d / 2);
    const cc = new THREE.Vector3(x, y0 + h, cz + d / 2);
    const dd = new THREE.Vector3(x, y0 + h, cz - d / 2);
    this.quad(a, b, cc, dd, c, { glow }, new THREE.Vector3(x - facing, y0 + h / 2, cz));
    return this;
  }

  /** One-sided vertical quad in the x-y plane at z, facing +z (toward the camera). */
  paneZ(cx: number, y0: number, z: number, w: number, h: number, hex: number, glow = false): this {
    const c = color.setHex(hex).clone();
    const a = new THREE.Vector3(cx - w / 2, y0, z);
    const b = new THREE.Vector3(cx + w / 2, y0, z);
    const cc = new THREE.Vector3(cx + w / 2, y0 + h, z);
    const dd = new THREE.Vector3(cx - w / 2, y0 + h, z);
    this.quad(a, b, cc, dd, c, { glow }, new THREE.Vector3(cx, y0 + h / 2, z - 1));
    return this;
  }

  /** Appends another builder's triangles moved by (dx, dy, dz) (scenery chunks are made of props). */
  append(other: GeoBuilder, dx: number, dy: number, dz: number, yaw = 0): this {
    const cs = Math.cos(yaw);
    const sn = Math.sin(yaw);
    for (let i = 0; i < other.pos.length; i += 3) {
      const x = other.pos[i];
      const z = other.pos[i + 2];
      this.pos.push(dx + x * cs + z * sn, dy + other.pos[i + 1], dz - x * sn + z * cs);
    }
    for (const v of other.col) this.col.push(v);
    for (const v of other.limb) this.limb.push(v);
    return this;
  }

  get vertexCount(): number {
    return this.pos.length / 3;
  }

  /** Static scenery skips the limb data. */
  build(limbs = true): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (limbs) g.setAttribute('aLimb', new THREE.Float32BufferAttribute(this.limb, 4));
    g.computeBoundingSphere();
    return g;
  }
}

/** Small deterministic random generator (mulberry32), so scenery looks the same every run of a stage. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
