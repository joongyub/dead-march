import type * as THREE from 'three';
import type { BuildingId } from '../meta/shelter';
import { GeoBuilder, rng } from './geo';

/** Dusk in the shelter: the sun is low, so everything but lamps and fire is baked a little darker. */
const LIGHT = 0.82;

const C = {
  sand: 0xbca57a,
  sandDark: 0x9c875f,
  wood: 0x8c6a46,
  woodDark: 0x5e4630,
  metal: 0x7f878c,
  metalDark: 0x555c62,
  rust: 0x8e5c3a,
  concrete: 0x9c978e,
  concreteDark: 0x76726a,
  roof: 0x4e4a48,
  olive: 0x5f723c,
  oliveDark: 0x47562c,
  red: 0xb83a30,
  yellow: 0xe2b232,
  black: 0x26282a,
  window: 0xffc472,
  screen: 0x7fe0ff,
  leaf: 0x5c9a3a,
  leafLight: 0x86bc4a,
  corn: 0xe8c860,
  soil: 0x5a4430,
  tire: 0x2a2a2c,
  team: 0x4fc3ff,
};

/** Size of each building (width, height, depth) for its tap area and label. */
export const BUILDING_SIZE: Record<BuildingId, { w: number; h: number; d: number }> = {
  wall: { w: 680, h: 120, d: 60 },
  armory: { w: 170, h: 130, d: 140 },
  garage: { w: 190, h: 130, d: 160 },
  farm: { w: 200, h: 90, d: 160 },
  radio: { w: 150, h: 220, d: 130 },
};

function crate(b: GeoBuilder, x: number, y: number, z: number, s: number, hex = C.olive): void {
  b.box(x, y, z, s, s * 0.85, s, hex);
  b.box(x, y + s * 0.85, z, s * 0.9, 1.5, s * 0.9, C.oliveDark);
}

function barrel(b: GeoBuilder, x: number, z: number, hex: number): void {
  b.cylinderY(x, 0, z, 9, 26, hex, 8);
  b.cylinderY(x, 26, z, 8, 1.5, C.black, 8);
}

function sandbags(b: GeoBuilder, x0: number, x1: number, z: number, layers: number): void {
  for (let l = 0; l < layers; l++) {
    const off = l % 2 === 0 ? 0 : 17;
    for (let x = x0 + off; x + 34 <= x1 + 0.1; x += 34) b.box(x + 17, l * 11, z, 33, 11, 20, (x / 34 + l) % 2 < 1 ? C.sand : C.sandDark, { taper: 0.88 });
  }
}

function tires(b: GeoBuilder, x: number, z: number, n: number): void {
  for (let i = 0; i < n; i++) b.cylinderY(x, i * 7, z, 12, 6.5, C.tire, 10);
}

function lamp(b: GeoBuilder, x: number, z: number, h: number): void {
  b.cylinderY(x, 0, z, 2.5, h, C.metalDark, 6);
  b.box(x, h, z + 6, 10, 5, 16, C.metalDark);
  b.box(x, h - 1.5, z + 8, 8, 1.5, 10, 0xfff0c0, { glow: true });
}

function jeep(b: GeoBuilder, x: number, z: number): void {
  b.box(x, 8, z, 46, 16, 74, C.olive);
  b.box(x, 24, z + 8, 42, 4, 30, C.oliveDark);
  b.box(x, 24, z - 10, 40, 14, 4, 0x8fb0b8);
  for (const sx of [-24, 24]) for (const sz of [-24, 24]) b.cylinderX(x + sx, 9, z + sz, 9, 7, C.tire, 10);
  b.box(x - 13, 12, z + 37.3, 7, 4, 1, 0xfff2b0, { glow: true });
  b.box(x + 13, 12, z + 37.3, 7, 4, 1, 0xfff2b0, { glow: true });
}

function wall(b: GeoBuilder, tier: number): void {
  if (tier === 0) {
    // Sandbags, a plank gate and barbed wire.
    sandbags(b, -340, -66, 0, 3);
    sandbags(b, 66, 340, 0, 3);
    for (const s of [-1, 1]) {
      b.box(s * 62, 0, 0, 12, 76, 12, C.woodDark);
      b.box(s * 30, 4, 0, 52, 60, 6, C.wood);
      b.box(s * 30, 20, 3.5, 50, 5, 1, C.woodDark);
      b.box(s * 30, 44, 3.5, 50, 5, 1, C.woodDark);
      b.cylinderX(s * 203, 37, 0, 1.4, 274, 0x6a6a6a, 4);
    }
    crate(b, -110, 0, 30, 24);
    crate(b, -84, 0, 34, 20, C.oliveDark);
    return;
  }
  if (tier === 1) {
    // Scrap-metal sheets on posts, a steel gate with floodlights.
    for (const s of [-1, 1]) {
      let i = 0;
      for (let x = 70; x < 340; x += 46, i++) {
        const hex = i % 3 === 0 ? C.rust : i % 3 === 1 ? C.metal : C.metalDark;
        b.box(s * (x + 23), 0, 0, 45, 84 + ((i * 7) % 3) * 5, 6, hex);
        b.box(s * x, 0, 4, 5, 94, 5, C.black);
      }
      sandbags(b, s < 0 ? -330 : 80, s < 0 ? -80 : 330, 16, 1);
      b.box(s * 30, 2, 0, 56, 82, 7, C.metalDark);
      b.box(s * 30, 38, 4, 56, 8, 1, C.yellow);
      b.box(s * 66, 0, 0, 16, 104, 16, C.concreteDark);
      b.box(s * 66, 104, 6, 12, 8, 10, C.metalDark);
      b.box(s * 66, 103, 11.2, 10, 6, 1, 0xfff0c0, { glow: true });
      b.cylinderX(s * 205, 92, 0, 1.4, 270, 0x6a6a6a, 4);
    }
    return;
  }
  // Concrete wall with battlements, two watchtowers and a striped steel gate.
  for (const s of [-1, 1]) {
    b.box(s * 205, 0, 0, 270, 112, 24, C.concrete);
    for (let x = 82; x < 340; x += 40) b.box(s * x, 112, 0, 20, 14, 24, C.concreteDark);
    b.box(s * 205, 40, 12.5, 270, 3, 1, C.concreteDark);
    b.box(s * 78, 0, 0, 24, 130, 30, C.concreteDark);
    b.box(s * 78, 130, 8, 14, 8, 12, C.metalDark);
    b.box(s * 78, 129, 14.2, 12, 6, 1, 0xfff0c0, { glow: true });
    // Watchtower.
    const tx = s * 300;
    for (const lx of [-22, 22]) for (const lz of [-22, 22]) b.box(tx + lx, 0, 40 + lz, 6, 160, 6, C.woodDark);
    b.box(tx, 160, 40, 66, 8, 66, C.wood);
    b.box(tx, 168, 73, 66, 18, 3, C.woodDark);
    b.box(tx - 33, 168, 40, 3, 18, 66, C.woodDark);
    b.box(tx + 33, 168, 40, 3, 18, 66, C.woodDark);
    b.box(tx, 200, 40, 76, 22, 76, C.roof, { taper: 0.25 });
    b.box(tx, 172, 30, 12, 10, 12, C.metalDark);
    b.box(tx, 172, 23.6, 10, 8, 1, 0xfff6d0, { glow: true });
  }
  b.box(0, 0, 0, 132, 104, 12, C.metalDark);
  for (let i = 0; i < 6; i++) b.box(-55 + i * 22, 42, 6.5, 22, 12, 1, i % 2 === 0 ? C.yellow : C.black);
  // Tank traps outside.
  for (const x of [-180, -40, 90, 210]) {
    b.box(x, 0, -70, 6, 40, 6, C.metalDark, { roll: 0.8 });
    b.box(x, 0, -70, 6, 40, 6, C.metalDark, { roll: -0.8 });
  }
}

function armory(b: GeoBuilder, tier: number): void {
  if (tier === 0) {
    b.box(0, 0, 0, 120, 64, 96, C.metal);
    b.box(0, 64, 0, 130, 8, 106, C.roof, { taper: 0.92 });
    b.box(-20, 0, 48.2, 34, 46, 2, C.metalDark);
    b.box(10, 48, 48.6, 60, 9, 1, C.yellow);
    crate(b, 80, 0, 18, 26);
    crate(b, 80, 22, 18, 22, C.oliveDark);
    crate(b, 78, 0, 46, 24);
    return;
  }
  if (tier === 1) {
    b.box(0, 0, -6, 150, 72, 112, C.concrete);
    b.box(0, 72, -6, 158, 8, 120, C.concreteDark);
    b.box(-30, 0, 50.2, 36, 50, 2, C.metalDark);
    b.box(-30, 54, 50.6, 70, 9, 1, C.yellow);
    for (const x of [24, 54]) b.box(x, 40, 50.4, 20, 8, 1, C.window, { glow: true });
    sandbags(b, -80, 20, 72, 2);
    // Machine-gun nest at the corner.
    sandbags(b, 34, 102, 70, 2);
    b.cylinderZ(68, 26, 70, 100, 2.5, C.black, 6);
    crate(b, -92, 0, 30, 24);
    crate(b, -92, 20, 30, 20, C.oliveDark);
    b.box(40, 80, -20, 3, 50, 3, C.metalDark);
    b.box(40, 128, -20, 5, 5, 5, 0xff4030, { glow: true });
    return;
  }
  b.box(0, 0, -6, 166, 78, 126, C.concreteDark);
  b.box(-12, 78, -16, 122, 56, 92, C.concrete);
  b.box(-12, 134, -16, 130, 8, 100, C.roof);
  b.box(-34, 0, 57.2, 40, 54, 2, C.metalDark);
  b.box(-34, 58, 57.6, 76, 10, 1, C.yellow);
  for (const x of [14, 46]) b.box(x, 36, 57.4, 22, 14, 1, C.window, { glow: true });
  for (const x of [-48, -12, 24]) b.box(x, 100, 30.4, 18, 14, 1, C.window, { glow: true });
  // Roof turret and flag.
  b.box(48, 78, -24, 40, 24, 40, C.oliveDark);
  b.cylinderZ(48, 92, -44, -96, 3.2, C.black, 6);
  b.cylinderY(-62, 142, -50, 2, 74, C.metalDark, 6);
  b.box(-48, 192, -50, 26, 16, 1.5, C.red);
  sandbags(b, -84, 84, 80, 2);
  crate(b, 98, 0, 40, 26);
  crate(b, 98, 22, 40, 22, C.oliveDark);
  crate(b, 98, 0, 70, 24);
}

function garage(b: GeoBuilder, tier: number): void {
  if (tier === 0) {
    b.box(0, 0, 0, 150, 76, 110, C.rust);
    b.box(0, 76, 0, 158, 10, 118, C.metalDark, { taper: 0.9 });
    b.box(0, 0, 55.3, 86, 60, 2, C.metalDark);
    for (let y = 6; y < 58; y += 8) b.box(0, y, 56.5, 86, 2.5, 1, C.metal);
    tires(b, 92, 30, 3);
    barrel(b, -88, 34, C.red);
    barrel(b, -92, 58, 0x3a5a7a);
    return;
  }
  if (tier === 1) {
    b.box(0, 0, -10, 160, 82, 116, C.metal);
    b.box(0, 82, -10, 168, 10, 124, C.metalDark, { taper: 0.9 });
    b.box(0, 0, 48.3, 96, 64, 2, C.black);
    b.box(0, 66, 48.8, 96, 6, 1, C.yellow);
    jeep(b, 0, 100);
    b.box(-100, 0, 30, 26, 22, 54, C.wood);
    b.box(-100, 22, 30, 28, 3, 56, C.woodDark);
    tires(b, 100, 20, 4);
    tires(b, 100, 46, 2);
    barrel(b, -96, 80, C.red);
    return;
  }
  b.box(0, 0, -16, 196, 104, 140, C.metal);
  b.box(0, 104, -16, 202, 28, 146, C.metalDark, { taper: 0.66 });
  b.box(0, 0, 54.3, 126, 84, 2, C.black);
  b.box(0, 86, 54.8, 126, 7, 1, C.yellow);
  // Armored truck rolling out.
  b.box(0, 12, 70, 62, 34, 96, C.olive);
  b.box(0, 46, 82, 54, 18, 44, C.oliveDark);
  b.box(0, 30, 118.2, 52, 12, 1, 0x8fb0b8);
  b.box(0, 46, 46, 56, 3, 30, C.team);
  for (const sx of [-32, 32]) for (const sz of [42, 72, 102]) b.cylinderX(sx, 12, sz, 12, 9, C.tire, 10);
  b.box(-18, 18, 118.4, 9, 5, 1, 0xfff2b0, { glow: true });
  b.box(18, 18, 118.4, 9, 5, 1, 0xfff2b0, { glow: true });
  // Crane.
  b.box(96, 0, 66, 8, 140, 8, C.yellow);
  b.box(64, 134, 66, 72, 7, 7, C.yellow);
  b.box(34, 70, 66, 1.5, 64, 1.5, C.black);
  b.box(34, 62, 66, 8, 8, 8, C.metalDark);
  tires(b, -108, 70, 3);
}

function farm(b: GeoBuilder, tier: number): void {
  const w = tier === 0 ? 160 : 186;
  const d = tier === 0 ? 120 : 140;
  b.flat(0, 0.6, 0, w, d, C.soil);
  const rows = tier === 0 ? 4 : 5;
  for (let r = 0; r < rows; r++) {
    const z = -d / 2 + 16 + (r * (d - 32)) / (rows - 1);
    b.flat(0, 0.9, z, w - 20, 10, 0x4a3624);
    if (tier === 2 && r < 3) continue;
    for (let x = -w / 2 + 16; x < w / 2 - 10; x += 18) {
      if (tier === 0) {
        b.box(x, 0, z, 8, 9, 8, C.leaf, { taper: 0.4 });
      } else {
        b.box(x, 0, z, 9, 22, 9, r % 2 === 0 ? C.leaf : C.leafLight, { taper: 0.6 });
        if (r % 2 === 0) b.box(x, 18, z, 6, 9, 6, C.corn);
      }
    }
  }
  // Low fence.
  for (let x = -w / 2; x <= w / 2; x += w / 6) {
    b.box(x, 0, -d / 2, 4, 22, 4, C.woodDark);
    b.box(x, 0, d / 2, 4, 22, 4, C.woodDark);
  }
  b.box(0, 14, d / 2, w, 3, 2, C.wood);
  b.box(0, 14, -d / 2, w, 3, 2, C.wood);
  b.box(-w / 2, 14, 0, 2, 3, d, C.wood);
  b.box(w / 2, 14, 0, 2, 3, d, C.wood);
  if (tier === 0) {
    // Scarecrow.
    b.box(30, 0, 0, 3, 54, 3, C.woodDark);
    b.box(30, 38, 0, 36, 3, 3, C.woodDark);
    b.box(30, 26, 0, 16, 18, 8, 0x8a4a3a);
    b.box(30, 52, 0, 11, 11, 11, 0xd8c890);
    b.box(30, 63, 0, 18, 3, 18, 0x6a5030, { taper: 0.5 });
    return;
  }
  b.cylinderY(w / 2 + 16, 0, d / 2 - 10, 12, 30, 0x3a5a7a, 8);
  if (tier === 1) {
    // Tool shed and chicken coop.
    b.box(-w / 2 - 18, 0, -30, 34, 34, 40, C.wood);
    b.box(-w / 2 - 18, 34, -30, 40, 12, 46, C.roof, { taper: 0.2 });
    b.box(w / 2 + 20, 0, -36, 30, 20, 28, C.woodDark);
    b.box(w / 2 + 20, 20, -36, 34, 8, 32, C.red, { taper: 0.3 });
    return;
  }
  // Lit greenhouse at the back and a water tower.
  b.box(0, 0, -30, 160, 46, 76, 0x5e9484);
  b.box(0, 46, -30, 164, 26, 80, 0x7cb4a2, { taper: 0.15 });
  // Grow lights showing through the glass.
  b.box(0, 14, 8.3, 150, 22, 1, 0xc8f0a0, { glow: true });
  b.box(0, 50, 5, 120, 6, 1, 0xe0ffc0, { glow: true });
  for (let x = -80; x <= 80; x += 32) b.box(x, 0, 8.6, 3, 50, 2, C.metal);
  b.box(0, 46, 8.6, 162, 3, 2, C.metal);
  for (const lx of [-14, 14]) for (const lz of [-14, 14]) b.box(-w / 2 - 26 + lx, 0, 30 + lz, 4, 70, 4, C.woodDark);
  b.cylinderY(-w / 2 - 26, 70, 30, 24, 34, C.metal, 10);
  b.cylinderY(-w / 2 - 26, 104, 30, 25, 6, C.metalDark, 10, {}, 4);
}

function radio(b: GeoBuilder, tier: number): void {
  if (tier === 0) {
    b.box(0, 0, 0, 86, 54, 74, C.wood);
    b.box(0, 54, 0, 94, 14, 82, C.roof, { taper: 0.75 });
    b.box(-18, 0, 37.2, 24, 40, 2, C.woodDark);
    b.box(18, 24, 37.2, 22, 14, 1, C.screen, { glow: true });
    b.box(-32, 54, -22, 4, 150, 4, C.metalDark);
    b.box(-32, 204, -22, 8, 8, 8, 0xff3030, { glow: true });
    b.box(-32, 150, -22, 30, 2, 2, C.metalDark);
    return;
  }
  const big = tier === 2;
  b.box(0, 0, 6, big ? 124 : 100, big ? 68 : 60, big ? 92 : 84, big ? C.concreteDark : C.concrete);
  b.box(0, big ? 68 : 60, 6, big ? 130 : 106, 8, big ? 98 : 90, C.roof);
  b.box(-26, 0, (big ? 52 : 48) + 0.3, 26, 44, 2, C.metalDark);
  for (const x of big ? [8, 34] : [16]) b.box(x, 28, (big ? 52 : 48) + 0.5, 20, 14, 1, C.screen, { glow: true });
  // Tower on the yard side: the radio stands right of the camera, and a tall tower on its right
  // side would lean off the screen.
  const h = big ? 280 : 220;
  const tx = big ? -40 : -30;
  const tz = -40;
  b.box(tx, 0, tz, big ? 46 : 34, h, big ? 46 : 34, C.metalDark, { taper: 0.12 });
  for (let y = 40; y < h - 20; y += 40) b.box(tx, y, tz, (big ? 46 : 34) * (1 - (0.88 * y) / h) + 4, 2.5, (big ? 46 : 34) * (1 - (0.88 * y) / h) + 4, C.metal);
  b.box(tx, h, tz, 8, 8, 8, 0xff3030, { glow: true });
  if (big) b.box(tx, h * 0.55, tz + 14, 6, 6, 6, 0xff3030, { glow: true });
  // Dishes.
  b.box(30, (big ? 76 : 68), -10, 34, 3, 34, C.metal, { rotX: -0.9 });
  b.box(30, (big ? 76 : 68) - 6, -6, 4, 14, 4, C.metalDark);
  if (big) {
    b.box(tx + 6, h * 0.62, tz + 22, 30, 3, 30, C.metal, { rotX: -1.1 });
    // Solar panels.
    for (const x of [-60, -28]) b.box(x, 6, 76, 28, 3, 18, 0x2a3a6a, { rotX: -0.5 });
  }
  // Generator.
  b.box(64, 0, 30, 30, 22, 24, C.olive);
  b.cylinderY(70, 22, 24, 3, 14, C.black, 6);
}

/** One building at one of its three looks (levels 1–6, 7–13, 14+), feet at the origin, front toward +z. */
export function buildingModel(id: BuildingId, tier: number): THREE.BufferGeometry {
  const b = new GeoBuilder(LIGHT);
  if (id === 'wall') wall(b, tier);
  else if (id === 'armory') armory(b, tier);
  else if (id === 'garage') garage(b, tier);
  else if (id === 'farm') farm(b, tier);
  else radio(b, tier);
  return b.build(false);
}

/**
 * The yard: ground, the road out through the gate, the fence, the ruined city outside, tents and
 * benches around the campfire, lamp posts. Fences sit at x = 0 and 720, the gate at z = -560.
 */
export function yardModel(fire: { x: number; z: number }, lamps: readonly { x: number; z: number }[]): THREE.BufferGeometry {
  const r = rng(4242);
  const b = new GeoBuilder(LIGHT);
  b.flat(360, -1, -600, 6000, 6000, 0x3c342e);
  b.flat(360, -0.5, -70, 720, 1000, 0x5e5040);
  for (let i = 0; i < 26; i++) b.blob(30 + r() * 660, -0.3, -540 + r() * 960, 20 + r() * 50, r() < 0.5 ? 0x564a3c : 0x66584a, r, 8);
  // Worn path from the gate to the fire, and tire tracks to the garage.
  b.flat(360, -0.2, -300, 90, 560, 0x6c5e4c);
  b.flat(470, -0.15, -250, 200, 26, 0x54483a);
  // Light pools around the fire and the lamps.
  b.blob(fire.x, -0.1, fire.z, 190, 0x6a5440, r, 14);
  b.blob(fire.x, 0, fire.z, 130, 0x7e6044, r, 14);
  b.blob(fire.x, 0.1, fire.z, 80, 0x92704a, r, 12);
  for (const l of lamps) b.blob(l.x, -0.05, l.z + 14, 70, 0x6e5e48, r, 10);
  // The road out of the gate into the city.
  b.flat(360, -0.4, -1900, 240, 2700, 0x3c3e3e);
  for (let z = -640; z > -3200; z -= 160) b.flat(360, -0.3, z, 7, 70, 0xb8b088);
  // Fence on three sides.
  for (const x of [0, 720]) {
    for (let z = -540; z <= 430; z += 60) b.box(x, 0, z, 6, 66, 6, C.metalDark);
    for (const y of [16, 36, 56]) b.box(x, y, -55, 2, 2, 970, 0x6a6e70);
    b.cylinderZ(x, 66, -540, 430, 1.4, 0x6a6a6a, 4);
  }
  for (let x = 0; x <= 720; x += 60) b.box(x, 0, 430, 6, 66, 6, C.metalDark);
  for (const y of [16, 36, 56]) b.box(360, y, 430, 720, 2, 2, 0x6a6e70);
  // Ruined city outside the fence.
  for (const side of [-1, 1]) {
    let z = 600;
    while (z > -3000) {
      const len = 120 + r() * 160;
      const h = 90 + r() * 300;
      const deep = 140 + r() * 160;
      const x = side < 0 ? -90 - deep / 2 - r() * 60 : 810 + deep / 2 + r() * 60;
      const hex = [0x6e5a4e, 0x5a6470, 0x6a6460, 0x7a6450][Math.floor(r() * 4)];
      b.box(x, 0, z - len / 2, deep, h, len, hex);
      b.box(x, h, z - len / 2, deep * 0.9, 6, len * 0.9, 0x4a4442);
      const face = side < 0 ? x + deep / 2 + 0.6 : x - deep / 2 - 0.6;
      for (let wy = 30; wy < h - 20; wy += 38) {
        for (let wz = z - 20; wz > z - len + 10; wz -= 34) {
          const lit = r();
          b.paneX(face, wy, wz, 16, 20, lit < 0.1 ? C.window : 0x1e2228, side < 0 ? 1 : -1, lit < 0.1);
        }
      }
      if (r() < 0.25) b.cylinderY(x, h, z - len / 2, 18, 40, 0xff7a20, 6, { glow: true }, 0);
      z -= len + 10 + r() * 30;
    }
  }
  // Wrecks and junk outside.
  for (const [x, z] of [[-40, -700], [780, -420], [760, 200], [-50, 300]]) {
    b.box(x, 4, z, 50, 22, 90, 0x3a3634);
    b.box(x, 26, z + 6, 44, 14, 44, 0x2e2a28);
  }
  // Tents, benches and a woodpile around the fire.
  for (const [x, z, hex] of [[250, 110, 0x5a6e4a], [470, 110, 0x6a5a40], [210, -60, 0x4e6270]] as const) {
    b.box(x, 0, z, 70, 46, 60, hex, { taper: 0.04 });
    b.box(x, 0, z + 30.4, 16, 30, 1, 0x2a2622, { taper: 0.1 });
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const bx = fire.x + Math.cos(a) * 92;
    const bz = fire.z + Math.sin(a) * 70;
    if (Math.abs(Math.cos(a)) > 0.5) b.box(bx, 0, bz, 12, 9, 46, C.woodDark);
    else b.box(bx, 0, bz, 46, 9, 12, C.woodDark);
  }
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    b.box(fire.x + Math.cos(a) * 26, 0, fire.z + Math.sin(a) * 22, 10, 7, 9, 0x6e6a64);
  }
  b.box(fire.x, 0, fire.z, 30, 5, 6, 0x3a2a1c);
  b.box(fire.x, 0, fire.z, 6, 6, 30, 0x3a2a1c);
  b.box(fire.x, 0, fire.z, 16, 8, 16, 0xffa040, { glow: true, taper: 0.3 });
  for (let i = 0; i < 6; i++) b.cylinderX(520 + (i % 3) * 2, 6 + Math.floor(i / 3) * 11, -80 + (i % 3) * 13, 6, 50, C.wood, 6);
  // Supplies along the fence.
  for (let i = 0; i < 5; i++) crate(b, 30 + (i % 2) * 26, 0, -120 + i * 30, 24, i % 2 === 0 ? C.olive : C.wood);
  barrel(b, 690, 40, C.red);
  barrel(b, 690, 64, 0x3a5a7a);
  barrel(b, 668, 52, C.red);
  for (const l of lamps) lamp(b, l.x, l.z, 92);
  return b.build(false);
}
