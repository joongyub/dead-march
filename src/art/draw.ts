/** Small canvas helpers for the procedural art in sprites.ts. */
export type Ctx = CanvasRenderingContext2D;

export function ellipse(
  ctx: Ctx,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  fill: string | CanvasGradient,
  stroke?: string,
  lineWidth = 2,
): void {
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

export function circle(ctx: Ctx, cx: number, cy: number, r: number, fill: string | CanvasGradient, stroke?: string, lineWidth = 2): void {
  ellipse(ctx, cx, cy, r, r, fill, stroke, lineWidth);
}

export function roundRect(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string | CanvasGradient,
  stroke?: string,
  lineWidth = 2,
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

export function line(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, color: string, width: number): void {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineCap = 'round';
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.stroke();
}

export function polygon(ctx: Ctx, points: readonly number[], fill: string, stroke?: string, lineWidth = 2): void {
  ctx.beginPath();
  ctx.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

export function radial(ctx: Ctx, cx: number, cy: number, r: number, stops: readonly [number, string][]): CanvasGradient {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  for (const [at, color] of stops) g.addColorStop(at, color);
  return g;
}

export function linear(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, stops: readonly [number, string][]): CanvasGradient {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [at, color] of stops) g.addColorStop(at, color);
  return g;
}

/** Soft drop shadow under a figure, drawn first. */
export function shadow(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, alpha = 0.35): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, ry / rx);
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fillStyle = radial(ctx, 0, 0, rx, [[0, `rgba(0,0,0,${alpha})`], [0.7, `rgba(0,0,0,${alpha * 0.8})`], [1, 'rgba(0,0,0,0)']]);
  ctx.fill();
  ctx.restore();
}

/** Deterministic pseudo-random numbers so the art is identical on every load. */
export function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
