import * as THREE from 'three';
import { GeoBuilder, Limb, rng } from './geo';

/**
 * Every 3D model of the battle, built from boxes at startup (no model files to download). Sizes are in
 * road units (the road is 600 wide). Characters face -z, the direction the army marches; zombies are
 * turned around when placed.
 */

interface HumanSpec {
  skin: number;
  shirt: number;
  pants: number;
  shoes: number;
  head?: 'hair' | 'helmet' | 'bald';
  hair?: number;
  helmet?: number;
  /** Torso tilt forward in radians (zombies shamble hunched). */
  hunch?: number;
  /** Torso width and depth multipliers. */
  bulk?: number;
  belly?: number;
  /** Arm thickness multiplier. */
  arm?: number;
  /** Head size multiplier. */
  headSize?: number;
  pose?: 'pistol' | 'rifle' | 'mg' | 'claw';
  eyes?: number;
  band?: number;
  vest?: number;
  pack?: number;
  /** Bright spots on the torso (exploder pustules, boss gashes). */
  spots?: number;
  spikes?: number;
  stains?: number;
}

const SKIN = 0xe0b48a;
const TEAM = 0x4fc3ff;
const GUN = 0x24272c;
const GUN_LIGHT = 0x4a5058;

/** Where a humanoid's gun muzzle ends up, per pose (model units at scale 1), for muzzle flashes. */
export const MUZZLE: Record<string, { x: number; y: number; z: number }> = {
  pistol: { x: 10, y: 29, z: -17 },
  rifle: { x: 3.2, y: 27, z: -28 },
  mg: { x: 3.5, y: 28, z: -40 },
  tank: { x: 0, y: 28.6, z: -37 },
};

function human(b: GeoBuilder, s: HumanSpec): GeoBuilder {
  const hunch = s.hunch ?? 0;
  const bulk = s.bulk ?? 1;
  const belly = s.belly ?? 1;
  const armT = 4.6 * (s.arm ?? 1);
  const hip = 17;
  const legX = 4.2 * Math.min(1.4, bulk);
  const legW = 5.6 * Math.min(1.5, Math.sqrt(bulk));
  for (const side of [1, -1]) {
    const x = -side * legX;
    const leg = { limb: Limb.Leg, pivotY: hip, pivotZ: 0, side };
    b.box(x, 2.5, 0, legW, hip - 2, legW * 1.05, s.pants, leg);
    b.box(x, 0, -1.2, legW + 0.6, 3, 8.5, s.shoes, leg);
  }
  b.box(0, hip - 2.5, 0, 14 * Math.min(1.5, bulk), 5, 7.6 * Math.min(1.6, belly), s.pants);

  const torsoW = 15 * bulk;
  const torsoD = 8.5 * belly;
  const torsoH = 13;
  const base = hip + 1.5;
  const lean = { rotX: hunch, rotY: base, rotZ: 0 };
  b.box(0, base, 0, torsoW, torsoH, torsoD, s.shirt, { ...lean, taper: 1.04 });
  if (s.vest !== undefined) b.box(0, base + 1.5, 0, torsoW + 1.6, 9.5, torsoD + 1.6, s.vest, lean);
  if (s.stains !== undefined) {
    b.box(-torsoW * 0.18, base + 3, -torsoD / 2 - 0.2, torsoW * 0.35, 4, 0.8, s.stains, lean);
    b.box(torsoW * 0.22, base + 7.5, torsoD / 2 + 0.2, torsoW * 0.3, 3, 0.8, s.stains, lean);
  }
  if (s.spots !== undefined) {
    const r = rng(7);
    for (let i = 0; i < 7; i++) {
      const sz = 2.2 + r() * 1.6;
      const z = (i < 4 ? -1 : 1) * (torsoD / 2 + 0.3);
      b.box((r() - 0.5) * torsoW * 0.75, base + 2 + r() * 9, z, sz, sz, sz, s.spots, { ...lean, glow: true });
    }
  }
  if (s.pack !== undefined) b.box(0, base + 2, torsoD / 2 + 2.2, torsoW * 0.7, 10, 4.4, s.pack, lean);
  if (s.pose === 'mg') {
    // Ammo belt across the chest.
    b.box(0, base + 5, -torsoD / 2 - 0.9, torsoW * 0.9, 2.2, 1, 0xe8c34a, { ...lean, roll: 0.5 });
  }

  // Top of the torso after leaning forward: head and shoulders sit there.
  const topY = base + torsoH * Math.cos(hunch);
  const topZ = -torsoH * Math.sin(hunch);
  const shY = base + (torsoH - 1.5) * Math.cos(hunch);
  const shZ = -(torsoH - 1.5) * Math.sin(hunch);

  const hs = s.headSize ?? 1;
  const headW = 9 * hs;
  const headY = topY + 0.6;
  const headZ = topZ - 0.6;
  const head = { limb: Limb.Head, pivotY: topY, pivotZ: topZ };
  b.box(0, headY, headZ, headW, headW, headW, s.skin, head);
  if (s.head === 'hair') {
    b.box(0, headY + headW * 0.74, headZ, headW + 0.6, headW * 0.32, headW + 0.8, s.hair ?? 0x4a3020, head);
    b.box(0, headY + headW * 0.3, headZ + headW / 2, headW + 0.6, headW * 0.5, 1.6, s.hair ?? 0x4a3020, head);
  } else if (s.head === 'helmet') {
    b.box(0, headY + headW * 0.6, headZ, headW + 1.8, headW * 0.52, headW + 2, s.helmet ?? 0x5f7d3d, { ...head, taper: 0.82 });
    b.box(0, headY + headW * 0.58, headZ - 0.6, headW + 2.6, 1.1, headW + 3.2, s.helmet ?? 0x5f7d3d, head);
  }
  if (s.eyes !== undefined) {
    for (const side of [1, -1]) {
      b.box(side * headW * 0.24, headY + headW * 0.5, headZ - headW / 2 - 0.15, headW * 0.2, headW * 0.15, 0.6, s.eyes, { ...head, glow: true });
    }
  }
  if (s.spikes !== undefined) {
    for (const side of [1, -1]) {
      b.cylinderY(side * (torsoW / 2 - 1), shY - 1, shZ + 1, 2.6, 8, s.spikes, 5, {}, 0);
      b.cylinderY(side * (torsoW / 4), shY - 2, shZ + torsoD / 2, 2, 6, s.spikes, 5, {}, 0);
    }
  }

  // Arms hang from the shoulders; negative rotX swings a hanging part forward.
  const shX = torsoW / 2 + armT / 2 + 0.2;
  const armLen = 14;
  for (const side of [1, -1]) {
    const x = -side * shX;
    let rot = 0;
    let limb = Limb.Arm;
    if (s.pose === 'claw') {
      rot = -1.35;
      limb = Limb.Claw;
    } else if (s.pose === 'rifle' || s.pose === 'mg') {
      rot = s.pose === 'mg' ? -1.1 : -1.3;
      limb = Limb.None;
    } else if (s.pose === 'pistol' && side === -1) {
      rot = -1.45;
      limb = Limb.None;
    }
    const arm = { limb, pivotY: shY, pivotZ: shZ, side, rotX: rot, rotY: shY, rotZ: shZ };
    b.box(x, shY - armLen * 0.55, shZ, armT, armLen * 0.55, armT, s.shirt, arm);
    b.box(x, shY - armLen, shZ, armT * 0.92, armLen * 0.46, armT * 0.92, s.skin, arm);
    if (s.band !== undefined && side === 1) b.box(x, shY - armLen * 0.42, shZ, armT + 0.5, 2, armT + 0.5, s.band, arm);
  }
  if (s.pose === 'pistol') {
    b.box(shX, shY - 2.6, shZ - 13.5, 2, 3.4, 6, GUN);
  } else if (s.pose === 'rifle') {
    b.box(3, shY - 6, shZ - 15, 2.4, 3.2, 22, GUN);
    b.box(3, shY - 9, shZ - 11, 2, 3.5, 3, GUN_LIGHT);
  } else if (s.pose === 'mg') {
    b.box(3, shY - 9.5, shZ - 15, 4.4, 5, 22, GUN);
    b.cylinderZ(3, shY - 6.5, shZ - 26, shZ - 34, 1.3, GUN_LIGHT);
    b.box(7, shY - 13, shZ - 12, 5, 6, 6, 0x5a4a2a);
  }
  return b;
}

function scaleTo(g: THREE.BufferGeometry, s: number): THREE.BufferGeometry {
  g.scale(s, s, s);
  const limb = g.getAttribute('aLimb');
  if (limb) {
    for (let i = 0; i < limb.count; i++) {
      limb.setY(i, limb.getY(i) * s);
      limb.setZ(i, limb.getZ(i) * s);
    }
  }
  g.computeBoundingSphere();
  return g;
}

// ---------- the army ----------

export function survivorModel(): THREE.BufferGeometry {
  const b = human(new GeoBuilder(), {
    skin: SKIN, shirt: 0x2f86dd, pants: 0x3b4152, shoes: 0x2a2420, head: 'hair', hair: 0x4a3020, pose: 'pistol',
  });
  return b.build();
}

export function soldierModel(): THREE.BufferGeometry {
  const b = human(new GeoBuilder(), {
    skin: SKIN, shirt: 0x5b7a3c, pants: 0x4a5a2a, shoes: 0x2a2620, head: 'helmet', helmet: 0x56743a,
    vest: 0x3d5228, band: TEAM, pose: 'rifle',
  });
  return scaleTo(b.build(), 1.06);
}

export function gunnerModel(): THREE.BufferGeometry {
  const b = human(new GeoBuilder(), {
    skin: SKIN, shirt: 0x4a6a30, pants: 0x3e4a26, shoes: 0x24201c, head: 'helmet', helmet: 0x4d6a32,
    vest: 0x5a4a2a, band: TEAM, pack: 0x3e4a2a, pose: 'mg', bulk: 1.22, belly: 1.1, arm: 1.2,
  });
  return scaleTo(b.build(), 1.18);
}

export function tankModel(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  for (const x of [-17, 17]) {
    for (const z of [-19, 0, 19]) {
      b.cylinderX(x, 7.5, z, 7.5, 6, 0x24262a, 8);
      b.cylinderX(x + Math.sign(x) * 0.4, 7.5, z, 3, 6.2, 0x6a727a, 6);
    }
  }
  b.box(0, 5, 0, 29, 11, 58, 0x62763a);
  b.box(0, 5, -30, 29, 8, 6, 0x56693a, { taper: 0.7 });
  b.box(0, 15.6, 0, 30.4, 2.2, 58.4, TEAM);
  b.box(0, 17.5, 2, 26, 8, 44, 0x6f8442, { taper: 0.86 });
  b.box(0, 25, 7, 17, 7, 18, 0x5a6e34, { taper: 0.8 });
  b.cylinderY(-3, 31.5, 9, 3.4, 2, 0x4a5a2a, 8);
  b.cylinderZ(0, 28.6, -1, -33, 2, 0x30381f, 6);
  b.box(0, 26.4, -35, 4.6, 4.6, 4, 0x262a1a);
  for (const x of [-10, 10]) b.box(x, 12, -30.4, 4, 2.6, 1, 0xfff2b0, { glow: true });
  b.box(9, 18, 22, 6, 5, 8, 0x3d4a26);
  return b.build();
}

// ---------- zombies ----------

export function walkerModel(): THREE.BufferGeometry {
  return human(new GeoBuilder(), {
    skin: 0x8fae6a, shirt: 0x7a5a44, pants: 0x3e3e5a, shoes: 0x2a2430, head: 'bald', hunch: 0.28, pose: 'claw',
    eyes: 0xff3046, stains: 0x6a1220,
  }).build();
}

export function runnerModel(): THREE.BufferGeometry {
  const g = human(new GeoBuilder(), {
    skin: 0xa2bc7c, shirt: 0xb02a30, pants: 0x3d3550, shoes: 0x241e2a, head: 'hair', hair: 0x2a1f33, hunch: 0.55,
    bulk: 0.88, pose: 'claw', eyes: 0xff3046, stains: 0x5a1020,
  }).build();
  return scaleTo(g, 0.98);
}

export function exploderModel(): THREE.BufferGeometry {
  const g = human(new GeoBuilder(), {
    skin: 0xb8cc40, shirt: 0xa8bc38, pants: 0x4a4a30, shoes: 0x2a2a1a, head: 'bald', hunch: 0.12, bulk: 1.6,
    belly: 1.8, pose: 'claw', eyes: 0xffd040, spots: 0xffe36a,
  }).build();
  return scaleTo(g, 1.05);
}

export function bruteModel(): THREE.BufferGeometry {
  const g = human(new GeoBuilder(), {
    skin: 0x6e8e58, shirt: 0x5a3a4a, pants: 0x3d2f4a, shoes: 0x1e1828, head: 'bald', hunch: 0.32, bulk: 1.75,
    belly: 1.35, arm: 1.6, headSize: 0.85, pose: 'claw', eyes: 0xff3046, spikes: 0xc9c2b5, stains: 0x6a1220,
  }).build();
  return scaleTo(g, 1.55);
}

export function zombieModel(kind: string): THREE.BufferGeometry {
  switch (kind) {
    case 'runner':
      return runnerModel();
    case 'exploder':
      return exploderModel();
    case 'brute':
      return bruteModel();
    default:
      return walkerModel();
  }
}

/** Boss models, scaled so their width matches twice the boss radius in the rules. */
export function bossModel(kind: string, radius: number): THREE.BufferGeometry {
  const b = new GeoBuilder();
  switch (kind) {
    case 'butcher':
      human(b, {
        skin: 0xc8a6b4, shirt: 0xd7dde2, pants: 0x3a3040, shoes: 0x1e1828, head: 'bald', hunch: 0.2, bulk: 2,
        belly: 1.9, arm: 1.5, pose: 'claw', eyes: 0xff3046, stains: 0x7a1020,
      });
      // Cleaver in the right hand.
      b.box(17, 16, -22, 2, 16, 13, 0xd7dde2);
      b.box(17, 12, -18, 2.4, 5, 3, 0x4a2a1a);
      break;
    case 'hulk':
      human(b, {
        skin: 0x7a6a9a, shirt: 0x7a6a9a, pants: 0x3a3050, shoes: 0x1e1828, head: 'bald', hunch: 0.35, bulk: 2.1,
        belly: 1.4, arm: 2.3, headSize: 0.7, pose: 'claw', eyes: 0xff3046, spikes: 0xc9c2b5, stains: 0x5a1020,
      });
      break;
    case 'abomination': {
      human(b, {
        skin: 0x9a5a6a, shirt: 0x8a4a5a, pants: 0x3a2030, shoes: 0x1e1018, head: 'bald', hunch: 0.25, bulk: 2.2,
        belly: 1.6, arm: 1.5, pose: 'claw', eyes: 0xffd040, spots: 0xff7040, spikes: 0xc9c2b5,
      });
      // A second head and a second pair of arms grown out of the sides.
      b.box(-9, 33, -1, 7, 7, 7, 0xa86a7a, { limb: Limb.Head, pivotY: 32, pivotZ: 0 });
      b.box(-8, 37, -4.7, 1.6, 1.2, 0.6, 0xffd040, { glow: true });
      for (const side of [1, -1]) {
        b.box(side * 21, 10, -2, 5, 12, 5, 0x9a5a6a, { limb: Limb.Claw, pivotY: 22, pivotZ: -2, side, rotX: -1.1, rotY: 22, rotZ: -2 });
      }
      break;
    }
    case 'queen':
      human(b, {
        skin: 0xb8a8d8, shirt: 0x3a2050, pants: 0x2a1840, shoes: 0x1a1024, head: 'bald', hunch: 0.15, bulk: 1.3,
        belly: 1, arm: 1.1, pose: 'claw', eyes: 0xd040ff, spots: 0xd040ff,
      });
      // Crown of spikes.
      for (let i = 0; i < 5; i++) {
        const x = (i - 2) * 2.2;
        b.cylinderY(x, 41, -1, 1.2, 5 + (i === 2 ? 3 : i % 2 === 0 ? 1 : 2), 0x2a1f33, 4, { limb: Limb.Head, pivotY: 31, pivotZ: 0 }, 0);
      }
      break;
    default:
      human(b, {
        skin: 0x5a4a6a, shirt: 0x3d2f4a, pants: 0x2a2030, shoes: 0x1a1420, head: 'bald', hunch: 0.3, bulk: 1.8,
        belly: 1.3, arm: 1.5, pose: 'claw', eyes: 0xff3046, spikes: 0xc9c2b5, spots: 0xff3046,
      });
  }
  const g = b.build();
  g.computeBoundingBox();
  const box = g.boundingBox!;
  const width = box.max.x - box.min.x;
  return scaleTo(g, (radius * 1.9) / width);
}

// ---------- obstacles ----------

/** One sandbag segment of a barricade, 62 wide. */
export function sandbagModel(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const r = rng(3);
  for (let row = 0; row < 3; row++) {
    const n = row === 2 ? 2 : 3;
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * (60 / 3) + (row % 2) * 4;
      const tone = 0xa08a5a + Math.floor(r() * 3) * 0x050505;
      b.box(x, row * 9, 0, 19, 9.5, 14, tone, { taper: 0.9 });
    }
  }
  return b.build();
}

/** One plank-and-post segment of a barricade. */
export function plankModel(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.box(-26, 0, 0, 5, 34, 5, 0x5a3a20);
  b.box(26, 0, 0, 5, 34, 5, 0x5a3a20);
  b.box(0, 6, -3, 62, 7, 3, 0x8a6a3a, { roll: 0.06 });
  b.box(0, 15, -3, 62, 7, 3, 0x9a7a48, { roll: -0.08 });
  b.box(0, 24, -3, 62, 7, 3, 0x7a5a30, { roll: 0.04 });
  b.box(0, 3, 3, 64, 4, 4, 0x6a6a6a, { roll: 0.5 });
  return b.build();
}

/** Gate frame: a post (one per side and one in the middle) with a lamp on top. */
export function gatePostModel(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.box(0, 0, 0, 12, 6, 12, 0x3a3c40);
  b.box(0, 6, 0, 7, 118, 7, 0xb8bcc4);
  b.box(0, 124, 0, 10, 8, 10, 0x3a3c40);
  return b.build();
}

/** Small cube used for debris (gore, wood, sandbags, glass, casings). */
export function debrisModel(): THREE.BufferGeometry {
  return new GeoBuilder().box(0, -0.5, 0, 1, 1, 1, 0xffffff).build(false);
}
