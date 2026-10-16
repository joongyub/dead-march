import type Phaser from 'phaser';
import type { BuildingId } from '../meta/shelter';
import { addCanvasTexture, textureCanvas } from './canvasTexture';
import { circle, ellipse, line, linear, polygon, radial, roundRect, seeded, shadow, type Ctx } from './draw';

export const SHELTER_BG = 'shelter_bg';
export const SHELTER_BUILDINGS = 'shelter_bld';
/** Background size: the 720×1280 play frame plus 160 above and below for tall phones. */
export const SHELTER_BG_W = 720;
export const SHELTER_BG_H = 1600;
export const SHELTER_BG_MARGIN = 160;

/** Where each building stands in the 720×1280 frame (its foot), and its frame size in the texture. */
export const BUILDING_SPOTS: Record<BuildingId, { x: number; y: number }> = {
  wall: { x: 360, y: 300 },
  armory: { x: 180, y: 590 },
  garage: { x: 540, y: 590 },
  farm: { x: 180, y: 990 },
  radio: { x: 540, y: 990 },
};
export const CAMPFIRE = { x: 360, y: 790 };

const SLOTS: Record<BuildingId, { x: number; y: number; w: number; h: number }> = {
  wall: { x: 0, y: 0, w: 720, h: 200 },
  armory: { x: 0, y: 220, w: 280, h: 280 },
  garage: { x: 300, y: 220, w: 280, h: 280 },
  farm: { x: 600, y: 220, w: 280, h: 280 },
  radio: { x: 0, y: 520, w: 280, h: 300 },
};

/** Building look changes at these levels: 1–6, 7–13, 14–20. */
export function buildingTier(level: number): number {
  return level >= 14 ? 2 : level >= 7 ? 1 : 0;
}

/** Bottom-center of each frame sits on the building's spot. */
export function buildingOrigin(id: BuildingId): { x: number; y: number } {
  return id === 'wall' ? { x: 0.5, y: 0.8 } : { x: 0.5, y: 0.9 };
}

/** A box seen from above and in front: a lighter top face over a front face. */
function box(c: Ctx, x: number, y: number, w: number, h: number, depth: number, top: string, front: string, edge = '#120e0c'): void {
  roundRect(c, x, y - depth, w, depth + 4, 6, top, edge, 3);
  roundRect(c, x, y, w, h, 4, front, edge, 3);
}

function crate(c: Ctx, x: number, y: number, s: number): void {
  box(c, x, y, s, s * 0.7, s * 0.45, '#9a7a46', '#6e5430');
  line(c, x + 4, y + 4, x + s - 4, y + s * 0.7 - 4, 'rgba(0,0,0,0.35)', 2);
}

function sandbags(c: Ctx, x0: number, x1: number, y: number, rows = 2): void {
  for (let r = 0; r < rows; r++) {
    for (let x = x0 + (r % 2) * 12; x < x1; x += 24) {
      ellipse(c, x, y - r * 12, 14, 9, r % 2 ? '#a08a5e' : '#8e7850', '#3a2e1e', 2);
    }
  }
}

function drawWall(c: Ctx, tier: number): void {
  const y = 110;
  shadow(c, 360, y + 66, 360, 24, 0.4);
  const segment = (x0: number, x1: number) => {
    if (tier === 0) {
      sandbags(c, x0 + 10, x1 - 6, y + 40, 4);
      return;
    }
    const steel = tier === 2;
    box(c, x0, y, x1 - x0, 56, 34, steel ? '#7c8790' : '#8a8a82', steel ? '#4e5860' : '#5e5e58');
    for (let x = x0 + 40; x < x1 - 10; x += 52) line(c, x, y + 4, x, y + 52, 'rgba(0,0,0,0.35)', 3);
    if (steel) {
      for (let x = x0 + 14; x < x1; x += 26) {
        circle(c, x, y + 10, 2.5, '#c9d2d8');
        circle(c, x, y + 46, 2.5, '#c9d2d8');
        polygon(c, [x - 7, y - 34, x, y - 54, x + 7, y - 34], '#b9c2c8', '#1c2024', 2);
      }
    } else {
      c.beginPath();
      for (let x = x0; x <= x1; x += 10) c.lineTo(x, y - 40 - ((x / 10) % 2) * 10);
      c.strokeStyle = '#2a2a2a';
      c.lineWidth = 2.5;
      c.stroke();
    }
  };
  segment(8, 298);
  segment(422, 712);
  // Gate.
  const gateTop = tier === 0 ? '#5c4a32' : '#3f4a40';
  roundRect(c, 296, y - 34, 12, 96, 3, '#2a2422', '#120e0c', 2);
  roundRect(c, 412, y - 34, 12, 96, 3, '#2a2422', '#120e0c', 2);
  roundRect(c, 308, y - 10, 104, 66, 4, gateTop, '#120e0c', 3);
  line(c, 360, y - 8, 360, y + 54, '#120e0c', 3);
  for (let i = 0; i < 3; i++) line(c, 312, y + 6 + i * 18, 408, y + 6 + i * 18, 'rgba(0,0,0,0.3)', 3);
  if (tier >= 1) {
    // Watch posts with lamps.
    for (const x of [270, 450]) {
      roundRect(c, x - 18, y - 96, 36, 64, 4, '#4a3a2c', '#120e0c', 3);
      polygon(c, [x - 26, y - 96, x + 26, y - 96, x + 18, y - 118, x - 18, y - 118], '#6a2e24', '#120e0c', 3);
      circle(c, x, y - 76, tier === 2 ? 9 : 6, '#ffe7a0');
    }
  }
}

function drawArmory(c: Ctx, tier: number): void {
  shadow(c, 140, 246, 120, 26);
  box(c, 36, 150, 208, 86, 72, '#7a7c74', '#55574f');
  // Slit window and door.
  roundRect(c, 58, 166, 92, 16, 4, '#141414');
  roundRect(c, 168, 168, 52, 68, 4, '#3d3f38', '#120e0c', 2);
  c.fillStyle = '#f2c14e';
  c.font = 'bold 20px sans-serif';
  c.fillText('AMMO', 74, 218);
  crate(c, 196, 214, 36);
  crate(c, 226, 222, 30);
  if (tier >= 1) sandbags(c, 30, 160, 250, 2);
  if (tier >= 1) roundRect(c, 70, 92, 60, 20, 4, '#2b4a2b', '#120e0c', 2);
  if (tier === 2) {
    circle(c, 180, 100, 26, '#4a4f46', '#120e0c', 3);
    line(c, 180, 100, 230, 64, '#2a2d28', 10);
    line(c, 180, 100, 230, 64, '#5a6056', 4);
    circle(c, 60, 92, 7, '#ff4a3a');
  }
}

function drawGarage(c: Ctx, tier: number): void {
  shadow(c, 140, 248, 128, 26);
  box(c, 16, 142, 248, 96, 62, '#6e5a46', '#4e4034');
  const doors = tier === 0 ? 1 : 2;
  const dw = doors === 1 ? 130 : 100;
  for (let d = 0; d < doors; d++) {
    const x = doors === 1 ? 32 : 28 + d * 112;
    roundRect(c, x, 158, dw, 80, 3, '#2c2a26', '#120e0c', 2);
    for (let i = 0; i < 6; i++) {
      c.fillStyle = i % 2 ? '#f2c14e' : '#1a1a1a';
      c.fillRect(x + 4, 162 + i * 4, dw - 8, 4);
    }
    for (let i = 0; i < 4; i++) line(c, x + 4, 196 + i * 10, x + dw - 4, 196 + i * 10, 'rgba(255,255,255,0.08)', 2);
  }
  if (doors === 1) {
    // Tool rack and tyres.
    circle(c, 200, 222, 16, '#1d1d1d', '#000', 2);
    circle(c, 200, 222, 7, '#555');
    circle(c, 232, 226, 14, '#1d1d1d', '#000', 2);
  }
  if (tier === 2) {
    line(c, 40, 80, 40, 20, '#c98a2a', 8);
    line(c, 40, 22, 200, 22, '#c98a2a', 8);
    line(c, 180, 22, 180, 60, '#333', 3);
    polygon(c, [170, 60, 190, 60, 186, 74, 174, 74], '#888', '#222', 2);
  }
}

function drawFarm(c: Ctx, tier: number): void {
  shadow(c, 140, 246, 130, 26, 0.25);
  polygon(c, [20, 246, 260, 246, 236, 120, 44, 120], '#4a3624', '#1e140c', 3);
  const rows = tier === 0 ? 4 : 6;
  for (let r = 0; r < rows; r++) {
    const t = (r + 0.5) / rows;
    const y = 126 + t * 114;
    const x0 = 44 - t * 24 + 12;
    const x1 = 236 + t * 24 - 12;
    for (let x = x0; x < x1; x += 18) circle(c, x, y, 6 + t * 2, r % 3 === 2 ? '#8bc34a' : '#5f9e3a', '#20361a', 1.5);
  }
  // Fence.
  for (let x = 20; x <= 260; x += 24) line(c, x, 250, x, 232, '#7a5c3a', 4);
  line(c, 18, 240, 262, 240, '#7a5c3a', 4);
  // Water tank.
  roundRect(c, 214, 70, 46, 60, 8, '#5a7a8a', '#120e0c', 3);
  ellipse(c, 237, 70, 23, 8, '#7a9aaa', '#120e0c', 2);
  if (tier === 2) {
    c.save();
    c.globalAlpha = 0.45;
    ellipse(c, 110, 120, 80, 56, linear(c, 0, 64, 0, 176, [[0, '#d8f0ff'], [1, '#88b8d0']]), '#e8f6ff', 3);
    c.restore();
    for (let i = -2; i <= 2; i++) line(c, 110 + i * 30, 70, 110 + i * 38, 172, 'rgba(230,246,255,0.6)', 2);
  }
  if (tier >= 1) {
    line(c, 40, 140, 40, 90, '#7a5c3a', 4);
    line(c, 24, 104, 56, 104, '#7a5c3a', 4);
    circle(c, 40, 86, 9, '#d9b46a', '#3a2a14', 2);
  }
}

function drawRadio(c: Ctx, tier: number): void {
  shadow(c, 140, 268, 90, 22);
  const mastTop = tier === 2 ? 14 : tier === 1 ? 50 : 80;
  // Lattice mast behind the hut.
  line(c, 150, 200, 150, mastTop, '#6a6e72', 6);
  line(c, 170, 200, 162, mastTop + 8, '#6a6e72', 4);
  for (let y = mastTop + 16; y < 190; y += 22) line(c, 150, y, 166, y + 11, '#6a6e72', 2);
  circle(c, 152, mastTop, 7, '#ff4a3a');
  box(c, 70, 196, 140, 66, 46, '#6a5a48', '#4a3e32');
  roundRect(c, 88, 210, 42, 28, 3, '#9fd6ff', '#120e0c', 2);
  roundRect(c, 150, 212, 40, 50, 3, '#3a3028', '#120e0c', 2);
  if (tier >= 1) {
    // Satellite dish on the roof.
    ellipse(c, 102, 150, 24, 16, '#c8ccd0', '#120e0c', 3);
    line(c, 102, 150, 116, 170, '#555', 4);
  }
  crate(c, 214, 232, 34);
}

const DRAW: Record<BuildingId, (c: Ctx, tier: number) => void> = {
  wall: drawWall,
  armory: drawArmory,
  garage: drawGarage,
  farm: drawFarm,
  radio: drawRadio,
};

/**
 * All building pictures share one canvas texture. A building is redrawn in place only when its look
 * changes tier, then the texture is re-uploaded once.
 */
export function ensureBuildingTexture(scene: Phaser.Scene): Phaser.Textures.Texture {
  if (scene.textures.exists(SHELTER_BUILDINGS)) return scene.textures.get(SHELTER_BUILDINGS);
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const tex = addCanvasTexture(scene, SHELTER_BUILDINGS, canvas);
  for (const id of Object.keys(SLOTS) as BuildingId[]) {
    const s = SLOTS[id];
    tex.add(id, 0, s.x, s.y, s.w, s.h);
  }
  return tex;
}

/** Redraws one building in the shared canvas; call refreshCanvasTexture once after all redraws. */
export function drawBuilding(tex: Phaser.Textures.Texture, id: BuildingId, tier: number): void {
  const s = SLOTS[id];
  const c = textureCanvas(tex).getContext('2d')!;
  c.save();
  c.clearRect(s.x, s.y, s.w, s.h);
  c.beginPath();
  c.rect(s.x, s.y, s.w, s.h);
  c.clip();
  c.translate(s.x, s.y);
  DRAW[id](c, tier);
  c.restore();
}

/** Yard, road out through the gate, ruins outside, campfire ring. Drawn once. */
export function buildShelterBackground(scene: Phaser.Scene): void {
  if (scene.textures.exists(SHELTER_BG)) return;
  const W = SHELTER_BG_W;
  const H = SHELTER_BG_H;
  const M = SHELTER_BG_MARGIN;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext('2d')!;
  const rand = seeded(606);

  c.fillStyle = linear(c, 0, 0, 0, H, [[0, '#1a1416'], [0.3, '#2a241e'], [1, '#1c1a16']]);
  c.fillRect(0, 0, W, H);
  // Speckled dirt.
  for (let i = 0; i < 900; i++) {
    c.fillStyle = rand() < 0.5 ? 'rgba(255,240,220,0.04)' : 'rgba(0,0,0,0.12)';
    c.fillRect(rand() * W, rand() * H, 2 + rand() * 4, 2 + rand() * 3);
  }

  // Outside: ruins along the top and the road leading out of the gate.
  const wallY = M + BUILDING_SPOTS.wall.y;
  for (let x = -10; x < W; ) {
    const w = 40 + rand() * 80;
    const h = 60 + rand() * 160;
    c.fillStyle = '#120e12';
    c.fillRect(x, 0, w, M + 40 + h * 0.5 - rand() * 40);
    x += w + 4;
  }
  c.fillStyle = '#2a2a28';
  c.beginPath();
  c.moveTo(300, wallY);
  c.lineTo(420, wallY);
  c.lineTo(470, 0);
  c.lineTo(250, 0);
  c.closePath();
  c.fill();
  for (let y = 30; y < wallY - 40; y += 70) roundRect(c, 356, y, 8, 34, 3, 'rgba(216,207,150,0.45)');

  // Concrete yard inside the wall.
  const yardTop = wallY + 10;
  const yardBottom = M + 1150;
  roundRect(c, 24, yardTop, W - 48, yardBottom - yardTop, 28, '#3a3832', 'rgba(0,0,0,0.5)', 4);
  c.strokeStyle = 'rgba(0,0,0,0.18)';
  c.lineWidth = 2;
  for (let y = yardTop + 90; y < yardBottom; y += 90) {
    c.beginPath();
    c.moveTo(30, y);
    c.lineTo(W - 30, y);
    c.stroke();
  }
  for (let x = 24 + 116; x < W - 30; x += 116) {
    c.beginPath();
    c.moveTo(x, yardTop + 6);
    c.lineTo(x, yardBottom - 6);
    c.stroke();
  }
  // Cracks and oil stains.
  for (let i = 0; i < 18; i++) {
    const x = 40 + rand() * (W - 80);
    const y = yardTop + 20 + rand() * (yardBottom - yardTop - 40);
    if (rand() < 0.5) {
      ellipse(c, x, y, 18 + rand() * 30, 8 + rand() * 12, 'rgba(0,0,0,0.18)');
    } else {
      c.beginPath();
      c.moveTo(x, y);
      for (let k = 0; k < 4; k++) c.lineTo(x + (rand() - 0.5) * 60, y + (rand() - 0.5) * 30);
      c.strokeStyle = 'rgba(0,0,0,0.3)';
      c.stroke();
    }
  }

  // Campfire ring (the fire itself is animated by the scene).
  const fx = CAMPFIRE.x;
  const fy = M + CAMPFIRE.y;
  c.fillStyle = radial(c, fx, fy, 170, [[0, 'rgba(255,150,60,0.28)'], [1, 'rgba(255,150,60,0)']]);
  c.fillRect(fx - 170, fy - 170, 340, 340);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    ellipse(c, fx + Math.cos(a) * 40, fy + Math.sin(a) * 22, 11, 8, '#6a6660', '#2a2622', 2);
  }
  ellipse(c, fx, fy, 30, 16, '#1a1210');
  line(c, fx - 24, fy + 4, fx + 20, fy - 6, '#5a3a22', 7);
  line(c, fx - 18, fy - 8, fx + 24, fy + 6, '#5a3a22', 7);
  // Log benches.
  for (const [x, y, a] of [
    [fx - 92, fy - 10, -0.3],
    [fx + 92, fy - 10, 0.3],
    [fx, fy + 66, 0],
  ] as const) {
    c.save();
    c.translate(x, y);
    c.rotate(a);
    roundRect(c, -38, -9, 76, 18, 9, '#6a4a2c', '#2a1a0c', 2);
    c.restore();
  }

  // Lamp posts in the yard corners.
  for (const [x, y] of [
    [56, yardTop + 40],
    [W - 56, yardTop + 40],
    [56, yardBottom - 40],
    [W - 56, yardBottom - 40],
  ] as const) {
    c.fillStyle = radial(c, x, y, 90, [[0, 'rgba(255,220,140,0.22)'], [1, 'rgba(255,220,140,0)']]);
    c.fillRect(x - 90, y - 90, 180, 180);
    circle(c, x, y, 9, '#ffe7a0', '#2a2622', 3);
  }

  // Below the yard: debris and a vignette.
  for (let i = 0; i < 14; i++) {
    const x = rand() * W;
    const y = yardBottom + 20 + rand() * (H - yardBottom - 20);
    roundRect(c, x, y, 20 + rand() * 50, 10 + rand() * 20, 4, 'rgba(10,8,8,0.6)');
  }
  c.fillStyle = radial(c, W / 2, H / 2, H * 0.7, [[0.55, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.65)']]);
  c.fillRect(0, 0, W, H);

  addCanvasTexture(scene, SHELTER_BG, canvas);
}
