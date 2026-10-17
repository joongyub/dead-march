import * as THREE from 'three';
import { GeoBuilder, rng } from './geo';

/** Length of one stretch of street; a few of them are recycled ahead of the army. */
const CHUNK = 1200;
const SLOTS = 4;
const VARIANTS = 4;
const ROAD_L = 60;
const ROAD_R = 660;
const CURB = 6;
const WALK = 120;

const BUILDING_COLORS = [0xb07a5a, 0x7a92a8, 0xc0a880, 0x7a9078, 0xa07088, 0xb09a80, 0x8a8aa0];
const CAR_COLORS = [0x9a4a2a, 0x4a6a8a, 0xb8b8b0, 0x6a8a4a, 0x8a3a3a, 0x2a2826, 0xc89a3a];

function car(b: GeoBuilder, x: number, z: number, yaw: number, hex: number, burnt: boolean, r: () => number): void {
  const c = new GeoBuilder();
  const body = burnt ? 0x2a2522 : hex;
  c.box(0, 5, 0, 34, 12, 66, body);
  c.box(0, 17, 4, 30, 11, 34, burnt ? 0x221e1c : body, { taper: 0.82 });
  c.paneZ(0, 18.5, 21.2, 23, 7.5, 0x1e2830);
  c.paneZ(0, 18.5, -13.2, 23, 7.5, 0x26323c);
  for (const wx of [-17, 17]) for (const wz of [-21, 21]) c.cylinderX(wx, 7, wz, 7, 5, 0x1c1c1e, 7);
  if (!burnt) {
    c.box(-11, 11, -33.3, 6, 3, 0.8, 0xfff2b0, { glow: true });
    c.box(11, 11, -33.3, 6, 3, 0.8, 0xfff2b0, { glow: true });
  } else if (r() < 0.6) {
    // Still burning.
    c.cylinderY(-4, 28, 4, 9, 22, 0xff7a20, 6, { glow: true }, 0);
    c.cylinderY(6, 28, -2, 6, 15, 0xffc040, 5, { glow: true }, 0);
  }
  b.append(c, x, 0, z, yaw);
}

function barrel(b: GeoBuilder, x: number, z: number, r: () => number): void {
  const hex = r() < 0.5 ? 0x3a6a3a : 0x8a3a2a;
  b.cylinderY(x, 0, z, 8, 22, hex, 8);
  b.cylinderY(x, 7, z, 8.4, 1.6, 0x2a2a2a, 8);
  b.cylinderY(x, 15, z, 8.4, 1.6, 0x2a2a2a, 8);
  if (r() < 0.35) b.cylinderY(x, 22, z, 6, 14, 0xff8a20, 5, { glow: true }, 0);
}

function lamp(b: GeoBuilder, x: number, z: number, side: number, broken: boolean): void {
  b.box(x, 5, z, 4, 150, 4, 0x34363a);
  b.box(x - side * 14, 150, z, 30, 3, 4, 0x34363a);
  b.box(x - side * 26, 144, z, 10, 6, 8, broken ? 0x2a2a2a : 0xffe6a0, { glow: !broken });
}

function building(b: GeoBuilder, x0: number, x1: number, z0: number, z1: number, h: number, hex: number, r: () => number, roadSide: number): void {
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const w = x1 - x0;
  const d = z0 - z1;
  b.box(cx, 0, cz, w, h, d, hex);
  // Ground floor: darker band with a shop front.
  b.box(cx, 0, cz, w + 2, 34, d + 2, 0x3a3634);
  const face = roadSide > 0 ? x1 + 1.2 : x0 - 1.2;
  const dir = roadSide > 0 ? 1 : -1;
  b.paneX(face, 6, cz, d * 0.7, 22, r() < 0.3 ? 0xffb860 : 0x1a1e24, dir, true);
  // Windows on the side facing the street.
  const cols = Math.max(1, Math.floor(d / 34));
  const rows = Math.max(1, Math.floor((h - 50) / 40));
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const wz = z0 - (col + 0.5) * (d / cols);
      const lit = r();
      const hexW = lit < 0.12 ? 0xffb860 : lit < 0.2 ? 0xff7a30 : lit < 0.45 ? 0x14161a : 0x2a3440;
      b.paneX(face, 50 + row * 40, wz, 18, 24, hexW, dir, lit < 0.2);
    }
  }
  // Windows toward the camera end.
  const colsZ = Math.max(1, Math.floor(w / 40));
  for (let row = 0; row < rows; row += 2) {
    for (let col = 0; col < colsZ; col++) {
      b.paneZ(x0 + (col + 0.5) * (w / colsZ), 50 + row * 40, z0 + 1.2, 18, 24, r() < 0.15 ? 0xffb860 : 0x222a34, false);
    }
  }
  // Roof clutter, and now and then a fire on top.
  b.box(cx + (r() - 0.5) * w * 0.4, h, cz + (r() - 0.5) * d * 0.4, 30, 14, 26, 0x5a5a58);
  if (r() < 0.3) b.cylinderY(cx, h, cz, 14, 24, 0x6a6a68, 8);
  if (r() < 0.22) {
    b.cylinderY(cx - 10, h, cz, 22, 50, 0xff7a20, 6, { glow: true }, 0);
    b.cylinderY(cx + 14, h, cz - 10, 14, 34, 0xffc040, 5, { glow: true }, 0);
  }
  // Broken parapet.
  b.box(cx, h, z0 - 3, w, 6, 6, 0x4a4644);
}

/** One stretch of street: road, curbs, sidewalks, buildings and wrecks. Built once per variant. */
function chunk(seed: number): THREE.BufferGeometry {
  const r = rng(seed);
  const b = new GeoBuilder();
  const cz = -CHUNK / 2;
  // Ground, asphalt, and road markings.
  b.flat(360, -0.5, cz, 3600, CHUNK, 0x4a4440);
  b.flat(360, 0, cz, ROAD_R - ROAD_L, CHUNK, 0x4c4f4e);
  for (let i = 0; i < 7; i++) b.blob(ROAD_L + 40 + r() * 520, 0.15, -r() * CHUNK, 30 + r() * 50, r() < 0.5 ? 0x474a49 : 0x525554, r, 10);
  for (let f = 40; f < CHUNK; f += 160) b.flat(360, 0.3, -f, 7, 70, 0xd8cf96);
  b.flat(ROAD_L + 14, 0.3, cz, 4, CHUNK, 0x8d9288);
  b.flat(ROAD_R - 14, 0.3, cz, 4, CHUNK, 0x8d9288);
  for (let i = 0; i < 4; i++) {
    // Old blood and oil stains.
    b.blob(ROAD_L + 60 + r() * 480, 0.2, -r() * CHUNK, 10 + r() * 16, r() < 0.5 ? 0x5a2a2c : 0x383a3a, r, 9);
  }
  for (let i = 0; i < 3; i++) b.cylinderY(ROAD_L + 80 + r() * 440, 0, -r() * CHUNK, 16, 0.6, 0x3a3c3c, 10);
  // Curbs and sidewalks.
  b.box(ROAD_L - CURB / 2, 0, cz, CURB, 5, CHUNK, 0x9a9e96);
  b.box(ROAD_R + CURB / 2, 0, cz, CURB, 5, CHUNK, 0x9a9e96);
  b.box(ROAD_L - CURB - WALK / 2, 0, cz, WALK, 4.5, CHUNK, 0x86827a);
  b.box(ROAD_R + CURB + WALK / 2, 0, cz, WALK, 4.5, CHUNK, 0x86827a);
  for (let f = 0; f < CHUNK; f += 60) {
    b.flat(ROAD_L - CURB - WALK / 2, 4.7, -f, WALK, 1.6, 0x6e6a64);
    b.flat(ROAD_R + CURB + WALK / 2, 4.7, -f, WALK, 1.6, 0x6e6a64);
  }

  // Buildings along both sides.
  for (const side of [-1, 1]) {
    const edge = side < 0 ? ROAD_L - CURB - WALK : ROAD_R + CURB + WALK;
    let f = r() * 40;
    while (f < CHUNK - 60) {
      const len = Math.min(CHUNK - f, 140 + r() * 170);
      const deep = 180 + r() * 160;
      const h = 130 + r() * 330;
      const hex = BUILDING_COLORS[Math.floor(r() * BUILDING_COLORS.length)];
      const x0 = side < 0 ? edge - deep : edge;
      const x1 = side < 0 ? edge : edge + deep;
      building(b, x0, x1, -f, -(f + len), h, hex, r, -side);
      f += len + (r() < 0.3 ? 30 + r() * 40 : 4);
    }
    // Street lamps.
    for (let lf = 80 + r() * 100; lf < CHUNK; lf += 300) lamp(b, side < 0 ? ROAD_L - CURB - 14 : ROAD_R + CURB + 14, -lf, side, r() < 0.3);
  }

  // Wrecks and junk along the road edges.
  for (let i = 0; i < 5; i++) {
    const left = r() < 0.5;
    const x = left ? ROAD_L - 20 + r() * 50 : ROAD_R + 20 - r() * 50;
    car(b, x, -(r() * CHUNK), (r() - 0.5) * 1.1 + (r() < 0.3 ? Math.PI / 2 : 0), CAR_COLORS[Math.floor(r() * CAR_COLORS.length)], r() < 0.35, r);
  }
  for (let i = 0; i < 6; i++) {
    const left = r() < 0.5;
    barrel(b, left ? ROAD_L - 30 - r() * 70 : ROAD_R + 30 + r() * 70, -(r() * CHUNK), r);
  }
  for (let i = 0; i < 5; i++) {
    const left = r() < 0.5;
    const x = left ? ROAD_L - 40 - r() * 60 : ROAD_R + 40 + r() * 60;
    const z = -(r() * CHUNK);
    if (r() < 0.5) {
      b.box(x, 4.5, z, 20, 18, 20, 0x8a6a3a);
      b.box(x + 6, 22.5, z - 3, 14, 12, 14, 0x9a7a48);
    } else {
      b.box(x, 4.5, z, 34, 14, 12, 0xa08a5a, { taper: 0.85 });
      b.box(x, 18.5, z, 26, 10, 11, 0x9a845a, { taper: 0.85 });
    }
  }
  // Traffic cones on the road edges.
  for (let i = 0; i < 4; i++) {
    const x = r() < 0.5 ? ROAD_L + 20 + r() * 30 : ROAD_R - 20 - r() * 30;
    const z = -(r() * CHUNK);
    b.cylinderY(x, 0, z, 6, 18, 0xff7a20, 6, {}, 1);
    b.cylinderY(x, 7, z, 4.6, 3, 0xf0f0f0, 6);
  }
  return b.build(false);
}

/**
 * The street the army marches down: a few stretches of road and buildings, built once and moved
 * ahead of the army as it passes them, each drawn as a single mesh.
 */
export class Scenery {
  private readonly variants: THREE.BufferGeometry[] = [];
  private readonly slots: THREE.Mesh[] = [];
  private readonly slotChunk = new Int32Array(SLOTS).fill(-99999);
  private stage = 0;

  constructor(scene: THREE.Scene) {
    for (let v = 0; v < VARIANTS; v++) this.variants.push(chunk(1000 + v * 7919));
    const material = new THREE.MeshBasicMaterial({ vertexColors: true });
    for (let i = 0; i < SLOTS; i++) {
      const mesh = new THREE.Mesh(this.variants[0], material);
      mesh.matrixAutoUpdate = false;
      this.slots.push(mesh);
      scene.add(mesh);
    }
  }

  begin(stage: number): void {
    this.stage = stage;
    this.slotChunk.fill(-99999);
  }

  update(distance: number): void {
    const first = Math.floor((distance - 900) / CHUNK);
    for (let k = 0; k < SLOTS; k++) {
      const index = first + k;
      const slot = ((index % SLOTS) + SLOTS) % SLOTS;
      if (this.slotChunk[slot] === index) continue;
      this.slotChunk[slot] = index;
      const mesh = this.slots[slot];
      const variant = (((index * 7 + this.stage * 3) % VARIANTS) + VARIANTS) % VARIANTS;
      mesh.geometry = this.variants[variant];
      mesh.position.set(0, 0, -index * CHUNK);
      mesh.updateMatrix();
    }
  }
}
