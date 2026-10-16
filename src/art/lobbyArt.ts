import type Phaser from 'phaser';
import { addCanvasTexture } from './canvasTexture';
import { seeded } from './draw';

export const LOBBY_BG = 'lobby_bg';
const W = 720;
const H = 1280;
/** Where the road meets the horizon. */
export const LOBBY_HORIZON_Y = 760;

/**
 * Lobby backdrop drawn once: a burning city at dusk and the road the survivors march down.
 * One 720×1280 texture, scaled to cover taller screens.
 */
export function buildLobbyBackground(scene: Phaser.Scene): void {
  if (scene.textures.exists(LOBBY_BG)) return;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext('2d')!;
  const rand = seeded(2026);

  // Sky.
  const sky = c.createLinearGradient(0, 0, 0, LOBBY_HORIZON_Y);
  sky.addColorStop(0, '#0d0812');
  sky.addColorStop(0.45, '#2c0f26');
  sky.addColorStop(0.85, '#7a2422');
  sky.addColorStop(1, '#b4452a');
  c.fillStyle = sky;
  c.fillRect(0, 0, W, LOBBY_HORIZON_Y + 4);

  // Low red sun.
  const sun = c.createRadialGradient(500, 620, 10, 500, 620, 260);
  sun.addColorStop(0, 'rgba(255,170,110,0.95)');
  sun.addColorStop(0.25, 'rgba(240,90,60,0.6)');
  sun.addColorStop(1, 'rgba(240,90,60,0)');
  c.fillStyle = sun;
  c.fillRect(0, 300, W, 500);

  // Skyline layers, far to near.
  const layer = (base: number, minH: number, maxH: number, color: string, windows: boolean) => {
    let x = -20;
    while (x < W + 20) {
      const w = 34 + rand() * 70;
      const h = minH + rand() * (maxH - minH);
      c.fillStyle = color;
      c.beginPath();
      c.moveTo(x, base);
      c.lineTo(x, base - h);
      // Broken roofline.
      const steps = 2 + Math.floor(rand() * 3);
      for (let i = 1; i <= steps; i++) c.lineTo(x + (w * i) / steps, base - h + (rand() < 0.4 ? rand() * 40 : 0));
      c.lineTo(x + w, base);
      c.closePath();
      c.fill();
      if (rand() < 0.3) c.fillRect(x + w * 0.5, base - h - 30, 3, 30);
      if (windows) {
        for (let wy = base - h + 16; wy < base - 12; wy += 18) {
          for (let wx = x + 6; wx < x + w - 8; wx += 12) {
            if (rand() < 0.12) {
              c.fillStyle = rand() < 0.5 ? 'rgba(255,190,90,0.75)' : 'rgba(255,120,60,0.55)';
              c.fillRect(wx, wy, 5, 7);
            }
          }
        }
      }
      x += w + rand() * 6;
    }
  };
  layer(LOBBY_HORIZON_Y, 140, 380, '#3a1528', false);
  layer(LOBBY_HORIZON_Y, 70, 250, '#1d0c18', true);

  // Fires and smoke columns.
  for (let i = 0; i < 4; i++) {
    const x = 60 + rand() * 600;
    const fire = c.createRadialGradient(x, LOBBY_HORIZON_Y - 20, 4, x, LOBBY_HORIZON_Y - 20, 90);
    fire.addColorStop(0, 'rgba(255,160,60,0.8)');
    fire.addColorStop(1, 'rgba(255,90,30,0)');
    c.fillStyle = fire;
    c.fillRect(x - 90, LOBBY_HORIZON_Y - 110, 180, 180);
    for (let k = 0; k < 7; k++) {
      const sx = x + Math.sin(k * 0.9) * 20 + k * 6;
      const sy = LOBBY_HORIZON_Y - 60 - k * 60;
      const r = 30 + k * 14;
      const smoke = c.createRadialGradient(sx, sy, 0, sx, sy, r);
      smoke.addColorStop(0, 'rgba(20,10,16,0.45)');
      smoke.addColorStop(1, 'rgba(20,10,16,0)');
      c.fillStyle = smoke;
      c.fillRect(sx - r, sy - r, r * 2, r * 2);
    }
  }

  // Ground.
  const ground = c.createLinearGradient(0, LOBBY_HORIZON_Y, 0, H);
  ground.addColorStop(0, '#2a1a18');
  ground.addColorStop(1, '#10140e');
  c.fillStyle = ground;
  c.fillRect(0, LOBBY_HORIZON_Y, W, H - LOBBY_HORIZON_Y);

  // Road in perspective.
  const vx = W / 2;
  c.fillStyle = '#262826';
  c.beginPath();
  c.moveTo(vx - 14, LOBBY_HORIZON_Y);
  c.lineTo(vx + 14, LOBBY_HORIZON_Y);
  c.lineTo(W + 140, H);
  c.lineTo(-140, H);
  c.closePath();
  c.fill();
  c.strokeStyle = 'rgba(160,160,150,0.5)';
  c.lineWidth = 3;
  for (const side of [-1, 1]) {
    c.beginPath();
    c.moveTo(vx + side * 14, LOBBY_HORIZON_Y);
    c.lineTo(vx + side * (W / 2 + 140), H);
    c.stroke();
  }
  for (let t = 0.05; t < 1; t += 0.11) {
    const y0 = LOBBY_HORIZON_Y + (H - LOBBY_HORIZON_Y) * t * t;
    const y1 = LOBBY_HORIZON_Y + (H - LOBBY_HORIZON_Y) * (t + 0.05) * (t + 0.05);
    const w0 = 1 + t * 8;
    c.fillStyle = 'rgba(216,207,150,0.5)';
    c.beginPath();
    c.moveTo(vx - w0 / 2, y0);
    c.lineTo(vx + w0 / 2, y0);
    c.lineTo(vx + w0, y1);
    c.lineTo(vx - w0, y1);
    c.closePath();
    c.fill();
  }

  // Wrecks on the shoulders.
  for (let i = 0; i < 6; i++) {
    const t = 0.2 + rand() * 0.75;
    const y = LOBBY_HORIZON_Y + (H - LOBBY_HORIZON_Y) * t;
    const side = i % 2 === 0 ? -1 : 1;
    const x = vx + side * (40 + (W / 2 + 60) * t);
    const s = 0.3 + t;
    c.fillStyle = '#120c0e';
    c.beginPath();
    c.roundRect(x - 50 * s, y - 22 * s, 100 * s, 34 * s, 8 * s);
    c.fill();
    c.fillRect(x - 30 * s, y - 40 * s, 56 * s, 22 * s);
  }

  // Haze on the horizon and a vignette.
  const haze = c.createLinearGradient(0, LOBBY_HORIZON_Y - 80, 0, LOBBY_HORIZON_Y + 80);
  haze.addColorStop(0, 'rgba(190,80,60,0)');
  haze.addColorStop(0.5, 'rgba(190,80,60,0.25)');
  haze.addColorStop(1, 'rgba(190,80,60,0)');
  c.fillStyle = haze;
  c.fillRect(0, LOBBY_HORIZON_Y - 80, W, 160);
  const vignette = c.createRadialGradient(W / 2, H * 0.55, H * 0.25, W / 2, H * 0.55, H * 0.75);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.7)');
  c.fillStyle = vignette;
  c.fillRect(0, 0, W, H);

  addCanvasTexture(scene, LOBBY_BG, canvas);
}

export const LOBBY_LOGO = 'lobby_logo';
const LOGO_W = 640;
const LOGO_H = 320;

/** "DEAD / MARCH" poster title: blood-red top word with drips, bone-white bottom word. */
export function buildLogo(scene: Phaser.Scene): void {
  if (scene.textures.exists(LOBBY_LOGO)) return;
  const canvas = document.createElement('canvas');
  canvas.width = LOGO_W;
  canvas.height = LOGO_H;
  const c = canvas.getContext('2d')!;
  const rand = seeded(7);
  const font = (px: number) => `900 ${px}px "Arial Black", Impact, Roboto, system-ui, sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'alphabetic';
  c.lineJoin = 'round';

  // Fits a word to a width by squashing it horizontally, like a condensed poster face.
  const word = (text: string, px: number, baseline: number, maxWidth: number, fill: string | CanvasGradient) => {
    c.font = font(px);
    const sx = Math.min(1, maxWidth / c.measureText(text).width);
    c.save();
    c.translate(LOGO_W / 2, baseline);
    c.scale(sx, 1);
    c.strokeStyle = '#0b0608';
    c.lineWidth = 16;
    c.strokeText(text, 0, 0);
    c.fillStyle = fill;
    c.fillText(text, 0, 0);
    c.restore();
    return (c.measureText(text).width * sx) / 2;
  };

  const red = c.createLinearGradient(0, 20, 0, 150);
  red.addColorStop(0, '#ff5a4a');
  red.addColorStop(0.55, '#c0141c');
  red.addColorStop(1, '#6e0a10');
  const half = word('DEAD', 150, 146, 560, red);

  // Drips under the red word.
  for (let i = 0; i < 9; i++) {
    const x = LOGO_W / 2 - half + 24 + rand() * (half * 2 - 48);
    const len = 14 + rand() * 46;
    const w = 7 + rand() * 6;
    c.fillStyle = '#0b0608';
    c.beginPath();
    c.roundRect(x - w / 2 - 3, 132, w + 6, len + 3, w / 2 + 3);
    c.fill();
    c.fillStyle = '#9a0f16';
    c.beginPath();
    c.roundRect(x - w / 2, 132, w, len, w / 2);
    c.fill();
    c.beginPath();
    c.arc(x, 132 + len - 2, w * 0.7, 0, Math.PI * 2);
    c.fill();
  }

  const bone = c.createLinearGradient(0, 180, 0, 300);
  bone.addColorStop(0, '#fff7e0');
  bone.addColorStop(1, '#c9b98e');
  word('MARCH', 120, 296, 600, bone);

  // Wear: scratch the bone word with a few dark nicks.
  c.globalCompositeOperation = 'source-atop';
  c.fillStyle = 'rgba(60,40,30,0.55)';
  for (let i = 0; i < 40; i++) {
    c.fillRect(40 + rand() * 560, 200 + rand() * 96, 2 + rand() * 10, 2);
  }
  c.globalCompositeOperation = 'source-over';

  addCanvasTexture(scene, LOBBY_LOGO, canvas);
}
