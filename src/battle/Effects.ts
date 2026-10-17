import Phaser from 'phaser';
import { ATLAS, NUM_FONT } from '../art/atlas';

/** Scale/alpha curve of a short-lived effect sprite. */
const enum Curve {
  /** Scale and alpha go linearly from start to end values. */
  Linear,
  /** Pops in past full size, settles, holds, then fades (word popups). */
  Pop,
}

interface Fx {
  img: Phaser.GameObjects.Image;
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  drag: number;
  life: number;
  max: number;
  s0: number;
  s1: number;
  a0: number;
  a1: number;
  vr: number;
  curve: Curve;
  /** Set on spawn: the first update writes scale, alpha and position even if they never change. */
  fresh: boolean;
}

interface Decal {
  img: Phaser.GameObjects.Image;
  active: boolean;
  x: number;
  z: number;
  life: number;
}

interface FloatText {
  text: Phaser.GameObjects.BitmapText;
  active: boolean;
  x: number;
  y: number;
  life: number;
}

interface Slam {
  text: Phaser.GameObjects.BitmapText;
  active: boolean;
  x: number;
  y: number;
  life: number;
}

/**
 * Effect sprites: a normal-blend pool and an additive pool (glows, rings). Each pool keeps one blend mode
 * and depth for good, because changing a sprite's depth makes the scene re-sort its whole display list.
 */
export interface EffectPools {
  normal: number;
  add: number;
  decals: number;
  texts: number;
}

const DEFAULT_POOLS: EffectPools = { normal: 125, add: 55, decals: 48, texts: 12 };
const DECAL_LIFE = 5;
const TEXT_LIFE = 0.9;
const SLAM_LIFE = 1.5;
const SLAMS = 3;

/**
 * Pooled battle effects: tracers, sparks, glows, rings, word popups, ground decals and floating numbers.
 * Everything is created up front and recycled; nothing is allocated while a battle runs.
 */
export class Effects {
  private readonly fx: Fx[] = [];
  private readonly decals: Decal[] = [];
  private readonly texts: FloatText[] = [];
  private readonly slams: Slam[] = [];
  private slamCursor = 0;
  private normalCursor = 0;
  private addCursor = 0;
  private decalCursor = 0;
  private textCursor = 0;
  /** Multiplies how many particles bursts spawn (low-spec mode halves it). */
  density = 1;
  private readonly maxNormal: number;
  private readonly maxAdd: number;
  private readonly maxDecals: number;
  private readonly maxTexts: number;

  constructor(
    scene: Phaser.Scene,
    groundDepth: number,
    fxDepth: number,
    /** Additive effects sit on their own depth so they render as one batch after the normal ones. */
    addDepth: number,
    textDepth: number,
    pools: EffectPools = DEFAULT_POOLS,
  ) {
    this.maxNormal = pools.normal;
    this.maxAdd = pools.add;
    this.maxDecals = pools.decals;
    this.maxTexts = pools.texts;
    for (let i = 0; i < this.maxDecals; i++) {
      const img = scene.add.image(0, 0, ATLAS, 'blood').setVisible(false).setDepth(groundDepth);
      this.decals.push({ img, active: false, x: 0, z: 0, life: 0 });
    }
    for (let i = 0; i < this.maxNormal + this.maxAdd; i++) {
      const add = i >= this.maxNormal;
      const img = scene.add
        .image(0, 0, ATLAS, 'spark')
        .setVisible(false)
        .setDepth(add ? addDepth : fxDepth)
        .setBlendMode(add ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
      this.fx.push({ img, active: false, x: 0, y: 0, vx: 0, vy: 0, drag: 0, life: 0, max: 1, s0: 1, s1: 1, a0: 1, a1: 0, vr: 0, curve: Curve.Linear, fresh: false });
    }
    for (let i = 0; i < this.maxTexts; i++) {
      const text = scene.add.bitmapText(0, 0, NUM_FONT, '', 40).setOrigin(0.5).setVisible(false).setDepth(textDepth);
      this.texts.push({ text, active: false, x: 0, y: 0, life: 0 });
    }
    for (let i = 0; i < SLAMS; i++) {
      const text = scene.add.bitmapText(0, 0, NUM_FONT, '', 120).setOrigin(0.5).setVisible(false).setDepth(textDepth);
      this.slams.push({ text, active: false, x: 0, y: 0, life: 0 });
    }
  }

  /** Total effect sprites currently shown (for the debug overlay). */
  get activeCount(): number {
    let n = 0;
    for (const f of this.fx) if (f.active) n++;
    return n;
  }

  private nextFx(add: boolean): Fx {
    // Round-robin within the pool: when all are busy the oldest gets reused, invisible in a busy fight.
    const base = add ? this.maxNormal : 0;
    const size = add ? this.maxAdd : this.maxNormal;
    const cursor = add ? this.addCursor : this.normalCursor;
    let pick = cursor;
    for (let i = 0; i < size; i++) {
      const j = (cursor + i) % size;
      if (!this.fx[base + j].active) {
        pick = j;
        break;
      }
    }
    if (add) this.addCursor = (pick + 1) % size;
    else this.normalCursor = (pick + 1) % size;
    return this.fx[base + pick];
  }

  private spawn(frame: string, x: number, y: number, life: number, tint: number, curve: Curve = Curve.Linear, add = false): Fx {
    const f = this.nextFx(add);
    f.active = true;
    f.x = x;
    f.y = y;
    f.vx = 0;
    f.vy = 0;
    f.drag = 0;
    f.life = life;
    f.max = life;
    f.s0 = 1;
    f.s1 = 1;
    f.a0 = 1;
    f.a1 = 0;
    f.vr = 0;
    f.curve = curve;
    f.fresh = true;
    f.img.setFrame(frame).setTint(tint).setPosition(x, y).setRotation(0).setScale(1).setAlpha(1).setVisible(true);
    return f;
  }

  /** A bullet streak from (x0,y0) to (x1,y1). */
  tracer(x0: number, y0: number, x1: number, y1: number, tint = 0xfff2b0): void {
    const dur = 0.09;
    const f = this.spawn('tracer', x0, y0, dur, tint);
    f.vx = (x1 - x0) / dur;
    f.vy = (y1 - y0) / dur;
    f.a0 = 1;
    f.a1 = 0.7;
    f.img.setRotation(Math.atan2(y1 - y0, x1 - x0) + Math.PI / 2);
  }

  /** Short additive flash (muzzle, hit, explosion core). */
  glow(x: number, y: number, size: number, tint: number, life = 0.12): void {
    const f = this.spawn('soft', x, y, life, tint, Curve.Linear, true);
    const s = size / 64;
    f.s0 = s;
    f.s1 = s * 1.4;
    f.a0 = 0.7;
  }

  /** Expanding ring (merges, shockwaves). */
  ring(x: number, y: number, size: number, tint: number, life = 0.35): void {
    const f = this.spawn('ring', x, y, life, tint, Curve.Linear, true);
    f.s0 = (size / 128) * 0.25;
    f.s1 = size / 128;
    f.a0 = 0.8;
  }

  /** Burst of small pieces flying out. */
  burst(x: number, y: number, count: number, tint: number, speed: number, frame = 'spark', life = 0.4): void {
    const n = Math.max(1, Math.round(count * this.density));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.6);
      const f = this.spawn(frame, x, y, life * (0.6 + Math.random() * 0.5), tint);
      f.vx = Math.cos(a) * v;
      f.vy = Math.sin(a) * v;
      f.drag = 4;
      f.s0 = 0.6 + Math.random() * 0.8;
      f.s1 = f.s0 * 0.4;
      f.a0 = 1;
      f.a1 = 0;
      f.vr = (Math.random() - 0.5) * 12;
    }
  }

  /** A sprite (e.g. a soldier) flying from (x0,y0) into (x1,y1): the "gather" part of a merge. */
  converge(frame: string, x0: number, y0: number, x1: number, y1: number, life = 0.22): void {
    const f = this.spawn(frame, x0, y0, life, 0xffffff);
    f.vx = (x1 - x0) / life;
    f.vy = (y1 - y0) / life;
    f.s0 = 1;
    f.s1 = 0.5;
    f.a0 = 1;
    f.a1 = 0.3;
  }

  /** Big word in the middle of the action ("합체!", "돌파!", "보스 출현"). */
  popup(frame: string, x: number, y: number, life = 0.9, tint = 0xffffff): void {
    const f = this.spawn(frame, x, y, life, tint, Curve.Pop);
    f.vy = -30;
  }

  /** Blood or debris left on the road; scrolls with the track. */
  decal(trackX: number, trackZ: number, tint: number, scale: number): void {
    if (this.maxDecals === 0) return;
    const d = this.decals[this.decalCursor];
    this.decalCursor = (this.decalCursor + 1) % this.maxDecals;
    d.active = true;
    d.x = trackX;
    d.z = trackZ;
    d.life = DECAL_LIFE;
    d.img.setTint(tint).setScale(scale).setRotation(Math.random() * Math.PI * 2).setAlpha(0.85).setVisible(true);
  }

  /** Floating number like "+20" or "-35". */
  number(x: number, y: number, value: string, tint: number, size = 44): void {
    // Numbers still floating at the same spot move up a line instead of overlapping the new one.
    for (const o of this.texts) {
      if (o.active && Math.abs(o.x - x) < 160 && Math.abs(o.y - y) < size) o.y -= size;
    }
    const t = this.texts[this.textCursor];
    this.textCursor = (this.textCursor + 1) % this.maxTexts;
    t.active = true;
    t.x = x;
    t.y = y;
    t.life = TEXT_LIFE;
    t.text.setText(value).setFontSize(size).setTint(tint).setPosition(x, y).setAlpha(1).setScale(1.4).setVisible(true);
  }

  /**
   * A huge number that crashes down onto the screen (zombies killed): falls from three times its size,
   * shudders on impact, holds, then rises and fades.
   */
  slam(x: number, y: number, value: string, tint: number, size = 120): void {
    const t = this.slams[this.slamCursor];
    this.slamCursor = (this.slamCursor + 1) % SLAMS;
    t.active = true;
    t.x = x;
    t.y = y;
    t.life = SLAM_LIFE;
    t.text.setText(value).setFontSize(size).setTint(tint).setPosition(x, y).setAlpha(0).setScale(3.2).setVisible(true);
  }

  /** Advances all effects. Decals are placed from track coordinates: y = crowdY - (z - distance). */
  update(dt: number, roadX: number, crowdY: number, distance: number, viewBottom: number): void {
    for (const f of this.fx) {
      if (!f.active) continue;
      f.life -= dt;
      if (f.life <= 0) {
        f.active = false;
        f.img.setVisible(false);
        continue;
      }
      if (f.drag > 0) {
        const k = Math.max(0, 1 - f.drag * dt);
        f.vx *= k;
        f.vy *= k;
      }
      const t = 1 - f.life / f.max;
      // Only write what changes: many effects stand still or keep one size, and every setter call
      // shows up in the profile when 150+ effects are alive.
      if (f.curve === Curve.Pop) {
        const s = t < 0.15 ? (t / 0.15) * 1.25 : t < 0.3 ? 1.25 - ((t - 0.15) / 0.15) * 0.25 : 1;
        f.img.setScale(s).setAlpha(t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1);
      } else {
        if (f.s0 !== f.s1 || f.fresh) f.img.setScale(f.s0 + (f.s1 - f.s0) * t);
        if (f.a0 !== f.a1 || f.fresh) f.img.setAlpha(f.a0 + (f.a1 - f.a0) * t);
      }
      if (f.vr !== 0) f.img.rotation += f.vr * dt;
      if (f.vx !== 0 || f.vy !== 0 || f.fresh) {
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        f.img.setPosition(f.x, f.y);
      }
      f.fresh = false;
    }

    for (const d of this.decals) {
      if (!d.active) continue;
      d.life -= dt;
      const y = crowdY - (d.z - distance);
      if (d.life <= 0 || y > viewBottom + 60) {
        d.active = false;
        d.img.setVisible(false);
        continue;
      }
      d.img.setPosition(roadX + d.x, y);
      if (d.life < 1) d.img.setAlpha(0.85 * d.life);
    }

    for (const t of this.texts) {
      if (!t.active) continue;
      t.life -= dt;
      if (t.life <= 0) {
        t.active = false;
        t.text.setVisible(false);
        continue;
      }
      const p = 1 - t.life / TEXT_LIFE;
      t.text.setPosition(t.x, t.y - p * 90);
      t.text.setScale(p < 0.15 ? 1.4 - p * 2.6 : 1);
      if (p > 0.6) t.text.setAlpha(1 - (p - 0.6) / 0.4);
    }

    for (const t of this.slams) {
      if (!t.active) continue;
      t.life -= dt;
      if (t.life <= 0) {
        t.active = false;
        t.text.setVisible(false);
        continue;
      }
      const a = SLAM_LIFE - t.life;
      // Falls in, overshoots small, bounces back to full size.
      const s = a < 0.1 ? 3.2 - 2.45 * (a / 0.1) : a < 0.18 ? 0.75 + 0.35 * ((a - 0.1) / 0.08) : a < 0.26 ? 1.1 - 0.1 * ((a - 0.18) / 0.08) : 1;
      const shudder = a > 0.1 && a < 0.35 ? (1 - (a - 0.1) / 0.25) * 16 : 0;
      const rise = a > 1 ? (a - 1) * 120 : 0;
      t.text
        .setScale(s)
        .setPosition(t.x + (Math.random() - 0.5) * shudder, t.y + (Math.random() - 0.5) * shudder - rise)
        .setAlpha(a < 0.06 ? a / 0.06 : a > 1.05 ? Math.max(0, 1 - (a - 1.05) / 0.45) : 1);
    }
  }

  clear(): void {
    for (const f of this.fx) {
      f.active = false;
      f.img.setVisible(false);
    }
    for (const d of this.decals) {
      d.active = false;
      d.img.setVisible(false);
    }
    for (const t of this.texts) {
      t.active = false;
      t.text.setVisible(false);
    }
    for (const t of this.slams) {
      t.active = false;
      t.text.setVisible(false);
    }
  }
}
