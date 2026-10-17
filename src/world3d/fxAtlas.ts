import * as THREE from 'three';

/** Frames of the effect atlas (4×4 cells), drawn in white so instances can tint them. */
export const enum Frame {
  Glow = 0,
  Spark = 1,
  Ring = 2,
  Smoke = 3,
  Splat = 4,
  Flame = 5,
  Streak = 6,
  Scorch = 7,
  Shadow = 8,
  Shard = 9,
  Dust = 10,
  Flash = 11,
  Crack = 12,
  Drop = 13,
  Shock = 14,
}

const CELL = 128;

function cell(ctx: CanvasRenderingContext2D, frame: Frame, draw: (c: CanvasRenderingContext2D, r: number) => void): void {
  ctx.save();
  ctx.translate((frame % 4) * CELL + CELL / 2, Math.floor(frame / 4) * CELL + CELL / 2);
  ctx.beginPath();
  ctx.rect(-CELL / 2, -CELL / 2, CELL, CELL);
  ctx.clip();
  draw(ctx, CELL / 2 - 2);
  ctx.restore();
}

function radial(c: CanvasRenderingContext2D, r: number, stops: [number, number][]): CanvasGradient {
  const g = c.createRadialGradient(0, 0, 0, 0, 0, r);
  for (const [at, a] of stops) g.addColorStop(at, `rgba(255,255,255,${a})`);
  return g;
}

function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

/** Draws the 512×512 effect atlas once. */
export function buildFxTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = CELL * 4;
  canvas.height = CELL * 4;
  const ctx = canvas.getContext('2d')!;
  const r = seeded(11);

  cell(ctx, Frame.Glow, (c, rad) => {
    c.fillStyle = radial(c, rad, [[0, 1], [0.25, 0.7], [0.6, 0.18], [1, 0]]);
    c.fillRect(-rad, -rad, rad * 2, rad * 2);
  });
  cell(ctx, Frame.Spark, (c, rad) => {
    c.fillStyle = radial(c, rad * 0.5, [[0, 1], [0.5, 0.5], [1, 0]]);
    c.fillRect(-rad, -rad, rad * 2, rad * 2);
    c.fillStyle = '#fff';
    for (let i = 0; i < 4; i++) {
      c.rotate(Math.PI / 2);
      c.beginPath();
      c.moveTo(0, -rad);
      c.lineTo(rad * 0.09, 0);
      c.lineTo(-rad * 0.09, 0);
      c.fill();
    }
  });
  cell(ctx, Frame.Ring, (c, rad) => {
    c.fillStyle = radial(c, rad, [[0, 0], [0.72, 0], [0.86, 1], [1, 0]]);
    c.fillRect(-rad, -rad, rad * 2, rad * 2);
  });
  cell(ctx, Frame.Smoke, (c, rad) => {
    for (let i = 0; i < 9; i++) {
      const a = r() * Math.PI * 2;
      const d = r() * rad * 0.35;
      c.save();
      c.translate(Math.cos(a) * d, Math.sin(a) * d);
      const rr = rad * (0.45 + r() * 0.3);
      c.fillStyle = radial(c, rr, [[0, 0.5], [0.6, 0.3], [1, 0]]);
      c.fillRect(-rr, -rr, rr * 2, rr * 2);
      c.restore();
    }
  });
  cell(ctx, Frame.Splat, (c, rad) => {
    c.fillStyle = '#fff';
    c.beginPath();
    for (let i = 0; i <= 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const rr = rad * (0.45 + r() * 0.25);
      if (i === 0) c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    c.fill();
    for (let i = 0; i < 10; i++) {
      const a = r() * Math.PI * 2;
      const d = rad * (0.6 + r() * 0.35);
      c.beginPath();
      c.arc(Math.cos(a) * d, Math.sin(a) * d, rad * (0.04 + r() * 0.07), 0, Math.PI * 2);
      c.fill();
    }
  });
  cell(ctx, Frame.Flame, (c, rad) => {
    c.fillStyle = radial(c, rad, [[0, 1], [0.35, 0.85], [0.7, 0.3], [1, 0]]);
    c.beginPath();
    for (let i = 0; i <= 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const rr = rad * (0.75 + r() * 0.25);
      if (i === 0) c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    c.fill();
  });
  cell(ctx, Frame.Streak, (c, rad) => {
    const g = c.createLinearGradient(-rad, 0, rad, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.5)');
    g.addColorStop(0.5, 'rgba(255,255,255,1)');
    g.addColorStop(0.65, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    // Bright head (top) fading toward the tail (bottom).
    c.globalAlpha = 1;
    for (let y = -rad; y < rad; y += 4) {
      c.globalAlpha = Math.max(0, 1 - (y + rad) / (rad * 2)) ** 0.7;
      c.fillRect(-rad, y, rad * 2, 4);
    }
  });
  cell(ctx, Frame.Scorch, (c, rad) => {
    c.fillStyle = radial(c, rad, [[0, 0.95], [0.5, 0.8], [0.8, 0.3], [1, 0]]);
    c.beginPath();
    for (let i = 0; i <= 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const rr = rad * (0.7 + r() * 0.3);
      if (i === 0) c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    c.fill();
  });
  cell(ctx, Frame.Shadow, (c, rad) => {
    c.fillStyle = radial(c, rad, [[0, 0.85], [0.55, 0.6], [1, 0]]);
    c.fillRect(-rad, -rad, rad * 2, rad * 2);
  });
  cell(ctx, Frame.Shard, (c, rad) => {
    c.fillStyle = 'rgba(255,255,255,0.95)';
    c.beginPath();
    c.moveTo(0, -rad);
    c.lineTo(rad * 0.5, rad * 0.6);
    c.lineTo(-rad * 0.35, rad * 0.8);
    c.closePath();
    c.fill();
  });
  cell(ctx, Frame.Dust, (c, rad) => {
    for (let i = 0; i < 6; i++) {
      const a = r() * Math.PI * 2;
      const d = r() * rad * 0.3;
      c.save();
      c.translate(Math.cos(a) * d, Math.sin(a) * d);
      const rr = rad * (0.55 + r() * 0.3);
      c.fillStyle = radial(c, rr, [[0, 0.35], [1, 0]]);
      c.fillRect(-rr, -rr, rr * 2, rr * 2);
      c.restore();
    }
  });
  cell(ctx, Frame.Flash, (c, rad) => {
    c.fillStyle = radial(c, rad * 0.45, [[0, 1], [1, 0]]);
    c.fillRect(-rad, -rad, rad * 2, rad * 2);
    c.fillStyle = 'rgba(255,255,255,0.9)';
    for (let i = 0; i < 5; i++) {
      c.rotate((Math.PI * 2) / 5);
      c.beginPath();
      c.moveTo(0, -rad * (0.7 + (i % 2) * 0.3));
      c.lineTo(rad * 0.16, 0);
      c.lineTo(-rad * 0.16, 0);
      c.fill();
    }
  });
  cell(ctx, Frame.Crack, (c, rad) => {
    c.strokeStyle = '#fff';
    c.lineCap = 'round';
    for (let i = 0; i < 7; i++) {
      let a = (i / 7) * Math.PI * 2 + r() * 0.4;
      let x = 0;
      let y = 0;
      c.lineWidth = 5;
      c.beginPath();
      c.moveTo(0, 0);
      for (let k = 0; k < 4; k++) {
        a += (r() - 0.5) * 0.8;
        const step = rad * (0.18 + r() * 0.1);
        x += Math.cos(a) * step;
        y += Math.sin(a) * step;
        c.lineTo(x, y);
        c.lineWidth = Math.max(1, 5 - k);
      }
      c.stroke();
    }
  });
  cell(ctx, Frame.Drop, (c, rad) => {
    c.fillStyle = radial(c, rad * 0.6, [[0, 1], [0.7, 0.9], [1, 0]]);
    c.fillRect(-rad, -rad, rad * 2, rad * 2);
  });
  cell(ctx, Frame.Shock, (c, rad) => {
    c.fillStyle = radial(c, rad, [[0, 0], [0.5, 0.05], [0.8, 0.6], [0.9, 1], [1, 0]]);
    c.fillRect(-rad, -rad, rad * 2, rad * 2);
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
