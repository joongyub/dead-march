import Phaser from 'phaser';
import { FONT_FAMILY } from '../config';
import { FRAMES, type FrameSpec } from './sprites';

/** Texture key of the one battle atlas, and the bitmap font built inside it. */
export const ATLAS = 'atlas';
export const NUM_FONT = 'num';

const ATLAS_WIDTH = 1024;
const PAD = 2;

/** Characters in the number font. Changing numbers use BitmapText, which never re-uploads a texture. */
const GLYPHS = '0123456789+-x×÷/%,.:KMB!? ';
const GLYPH_SIZE = 60;
const GLYPH_HEIGHT = 76;
const GLYPH_STROKE = 10;

interface Placed {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
}

/**
 * Draws every frame and the number font onto one canvas and registers it as a single texture,
 * so a whole battle (units, zombies, effects, numbers) renders in one batch.
 */
export function buildAtlas(scene: Phaser.Scene): void {
  if (scene.textures.exists(ATLAS)) return;

  const measure = document.createElement('canvas').getContext('2d')!;
  measure.font = `900 ${GLYPH_SIZE}px ${FONT_FAMILY}`;
  const glyphSpecs: FrameSpec[] = [];
  const advances = new Map<string, number>();
  for (const ch of GLYPHS) {
    const advance = Math.ceil(measure.measureText(ch).width);
    advances.set(ch, advance);
    if (ch === ' ') continue;
    const w = advance + GLYPH_STROKE;
    glyphSpecs.push({
      name: `glyph_${ch.charCodeAt(0)}`,
      w,
      h: GLYPH_HEIGHT,
      draw: (c) => {
        c.font = `900 ${GLYPH_SIZE}px ${FONT_FAMILY}`;
        c.textBaseline = 'middle';
        c.lineJoin = 'round';
        c.lineWidth = GLYPH_STROKE;
        c.strokeStyle = '#120c14';
        c.strokeText(ch, GLYPH_STROKE / 2, GLYPH_HEIGHT / 2 + 3);
        c.fillStyle = '#fff';
        c.fillText(ch, GLYPH_STROKE / 2, GLYPH_HEIGHT / 2 + 3);
      },
    });
  }

  const placed = pack([...FRAMES, ...glyphSpecs]);
  const height = nextPow2(placed.reduce((m, p) => Math.max(m, p.y + p.h + PAD), 0));

  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_WIDTH;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  for (const p of placed) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.beginPath();
    ctx.rect(0, 0, p.w, p.h);
    ctx.clip();
    p.draw(ctx, p.w, p.h);
    ctx.restore();
  }

  const texture = scene.textures.addCanvas(ATLAS, canvas)!;
  const byName = new Map<string, Placed>();
  for (const p of placed) {
    texture.add(p.name, 0, p.x, p.y, p.w, p.h);
    byName.set(p.name, p);
  }

  // Bitmap font data in the shape Phaser's parsers produce, pointing into the atlas.
  const chars: Record<number, unknown> = {};
  for (const ch of GLYPHS) {
    const code = ch.charCodeAt(0);
    const advance = advances.get(ch) ?? 0;
    const p = byName.get(`glyph_${code}`);
    const gx = p?.x ?? 0;
    const gy = p?.y ?? 0;
    const gw = p?.w ?? 0;
    const gh = p?.h ?? 0;
    chars[code] = {
      x: gx,
      y: gy,
      width: gw,
      height: gh,
      centerX: Math.floor(gw / 2),
      centerY: Math.floor(gh / 2),
      xOffset: 0,
      yOffset: 0,
      xAdvance: advance - 2,
      data: {},
      kerning: {},
      u0: gx / ATLAS_WIDTH,
      v0: gy / height,
      u1: (gx + gw) / ATLAS_WIDTH,
      v1: (gy + gh) / height,
    };
  }
  scene.cache.bitmapFont.add(NUM_FONT, {
    data: { font: NUM_FONT, size: GLYPH_SIZE, lineHeight: GLYPH_HEIGHT, chars },
    texture: ATLAS,
    frame: null,
  });
}

/** Shelf packing, tallest first. */
function pack(specs: readonly FrameSpec[]): Placed[] {
  const sorted = [...specs].sort((a, b) => b.h - a.h || b.w - a.w);
  const out: Placed[] = [];
  let x = PAD;
  let y = PAD;
  let shelf = 0;
  for (const s of sorted) {
    if (x + s.w + PAD > ATLAS_WIDTH) {
      x = PAD;
      y += shelf + PAD;
      shelf = 0;
    }
    out.push({ name: s.name, x, y, w: s.w, h: s.h, draw: s.draw });
    x += s.w + PAD;
    shelf = Math.max(shelf, s.h);
  }
  return out;
}

function nextPow2(v: number): number {
  let p = 1;
  while (p < v) p *= 2;
  return p;
}

/** Formats an army or horde size for the number font: 950, 12.5K, 3.2M. */
export function formatCount(n: number): string {
  if (n < 10000) return String(Math.floor(n));
  if (n < 1e6) return `${(n / 1000).toFixed(n < 1e5 ? 1 : 0)}K`;
  return `${(n / 1e6).toFixed(1)}M`;
}
