import Phaser from 'phaser';
import { ATLAS } from '../art/atlas';
import { UNIT_FRAMES } from '../art/sprites';
import { quality } from '../core/quality';
import { TIER_COUNT } from '../sim/types';
import { Depth } from './depth';
import type { Effects } from './Effects';

/** Most unit sprites drawn for the player's crowd; the real army size is the number above it. */
export const MAX_CROWD_SPRITES = 90;
const GOLDEN_ANGLE = 2.39996323;
const TIER_SCALE = [1.4, 1.36, 1.28, 0.95];
const HUMAN_BLOOD = 0x9a1020;

/**
 * Draws the army as up to MAX_CROWD_SPRITES representative units in a sunflower formation:
 * tanks in the middle, survivors on the edge (they die first). Changes in the army are animated:
 * new units run in from the front, merged units fly into the unit they became, dead units leave blood.
 */
export class CrowdView {
  private readonly sprites: Phaser.GameObjects.Image[] = [];
  private readonly tier = new Int8Array(MAX_CROWD_SPRITES).fill(-1);
  private readonly ox = new Float32Array(MAX_CROWD_SPRITES);
  private readonly oy = new Float32Array(MAX_CROWD_SPRITES);
  private readonly tx = new Float32Array(MAX_CROWD_SPRITES);
  private readonly ty = new Float32Array(MAX_CROWD_SPRITES);
  private readonly phase = new Float32Array(MAX_CROWD_SPRITES);
  private readonly pop = new Float32Array(MAX_CROWD_SPRITES);
  private readonly flash = new Float32Array(MAX_CROWD_SPRITES);
  private readonly order = new Int8Array(MAX_CROWD_SPRITES);
  private readonly display = new Int32Array(TIER_COUNT);
  private readonly lastCounts = new Int32Array(TIER_COUNT).fill(-1);
  private shown = 0;
  private slotsFor = -1;
  private slotsRadius = -1;
  private lastPower = -1;
  private lastCap = -1;
  private time = 0;
  /** Screen position of the crowd center, updated every frame. */
  x = 0;
  y = 0;

  constructor(scene: Phaser.Scene) {
    for (let i = 0; i < MAX_CROWD_SPRITES; i++) {
      this.phase[i] = Math.random() * Math.PI * 2;
      this.sprites.push(scene.add.image(0, 0, ATLAS, 'u0').setVisible(false).setDepth(Depth.Actors + 0.5));
    }
  }

  get count(): number {
    return this.shown;
  }

  /** Brings the drawn units in line with the army. Cheap when nothing changed. */
  sync(counts: readonly number[], power: number, radius: number, fx: Effects, roadX: number, distance: number): void {
    let same = true;
    for (let i = 0; i < TIER_COUNT; i++) if (counts[i] !== this.lastCounts[i]) same = false;
    // Low-spec mode shows fewer units (core/quality.ts).
    const cap = Math.round(MAX_CROWD_SPRITES * quality.unitScale);
    if (same && radius === this.slotsRadius && cap === this.lastCap) return;
    this.lastCap = cap;
    const lost = this.lastPower >= 0 && power < this.lastPower;
    this.lastPower = power;
    for (let i = 0; i < TIER_COUNT; i++) this.lastCounts[i] = counts[i];

    // How many of each tier to draw: all of them if they fit, otherwise proportionally, at least one each.
    let total = 0;
    for (let i = 0; i < TIER_COUNT; i++) total += counts[i];
    let drawn = 0;
    for (let i = TIER_COUNT - 1; i >= 0; i--) {
      let d = counts[i];
      if (total > cap) d = counts[i] > 0 ? Math.max(1, Math.floor((counts[i] * cap) / total)) : 0;
      d = Math.min(d, cap - drawn);
      this.display[i] = d;
      drawn += d;
    }

    // Slot order: highest tier first, so big units sit in the middle.
    let n = 0;
    for (let t = TIER_COUNT - 1; t >= 0; t--) for (let k = 0; k < this.display[t]; k++) this.order[n++] = t;

    let glows = 0;
    for (let i = 0; i < n; i++) {
      const next = this.order[i];
      const prev = i < this.shown ? this.tier[i] : -1;
      const s = this.sprites[i];
      if (prev < 0) {
        // New unit: runs in from just ahead of the crowd.
        this.ox[i] = (Math.random() - 0.5) * radius * 1.4;
        this.oy[i] = -radius - 40 - Math.random() * 40;
        this.pop[i] = 0.6;
        s.setVisible(true);
      } else if (next > prev) {
        this.pop[i] = 1;
        if (glows++ < 4) fx.glow(this.x + this.ox[i], this.y + this.oy[i], 50 + next * 22, 0xfff1a8, 0.22);
      }
      if (next !== prev) {
        this.tier[i] = next;
        s.setFrame(UNIT_FRAMES[next]);
      }
    }
    for (let i = n; i < this.shown; i++) {
      const s = this.sprites[i];
      const sx = this.x + this.ox[i];
      const sy = this.y + this.oy[i];
      if (lost) {
        fx.decal(sx - roadX, distance + (this.y - sy), HUMAN_BLOOD, 0.45 + Math.random() * 0.25);
        fx.burst(sx, sy, 3, 0xd02030, 260, 'chunk', 0.35);
      } else {
        // Merged away: fly into the middle of the crowd.
        fx.converge(UNIT_FRAMES[Math.max(0, this.tier[i])], sx, sy, this.x, this.y - radius * 0.2);
      }
      this.tier[i] = -1;
      s.setVisible(false);
    }
    this.shown = n;

    if (n !== this.slotsFor || radius !== this.slotsRadius) {
      // Lower on screen draws in front. The front-to-back order of the slots depends only on how many
      // there are (the radius scales them all alike), so depths change, and the scene re-sorts its
      // display list, only when the count changes; every setDepth call queues a full re-sort.
      const reorder = n !== this.slotsFor;
      this.slotsFor = n;
      this.slotsRadius = radius;
      for (let i = 0; i < n; i++) {
        const u = Math.sqrt((i + 0.5) / n);
        const a = i * GOLDEN_ANGLE;
        this.tx[i] = Math.cos(a) * u * radius;
        this.ty[i] = Math.sin(a) * u * radius * 0.8;
        if (reorder) this.sprites[i].setDepth(Depth.Actors + 0.5 + (Math.sin(a) * u + 1) / 4);
      }
    }
  }

  update(dt: number, x: number, y: number, marching: boolean): void {
    this.x = x;
    this.y = y;
    this.time += dt;
    const k = 1 - Math.exp(-dt * 9);
    const step = marching ? 13 : 4;
    for (let i = 0; i < this.shown; i++) {
      this.ox[i] += (this.tx[i] - this.ox[i]) * k;
      this.oy[i] += (this.ty[i] - this.oy[i]) * k;
      const t = this.tier[i];
      const bob = Math.sin(this.time * step + this.phase[i]);
      const s = this.sprites[i];
      if (this.pop[i] > 0) this.pop[i] = Math.max(0, this.pop[i] - dt * 4);
      const scale = TIER_SCALE[t] * (1 + this.pop[i] * 0.7);
      s.setPosition(x + this.ox[i] + (t === 3 ? 0 : bob * 1.2), y + this.oy[i] + (t === 3 ? bob * 0.6 : Math.abs(bob) * -2.2));
      s.setScale(scale, scale * (t === 3 ? 1 : 1 - Math.abs(bob) * 0.05));
      if (this.flash[i] > 0) {
        this.flash[i] -= dt;
        if (this.flash[i] <= 0) s.clearTint();
      }
    }
  }

  /** White hit flash on the front units (the ones touching the enemy). */
  hitFront(): void {
    let flashed = 0;
    for (let i = 0; i < this.shown && flashed < 10; i++) {
      if (this.oy[i] < -this.slotsRadius * 0.25 && this.flash[i] <= 0 && Math.random() < 0.5) {
        this.flash[i] = 0.07;
        this.sprites[i].setTintFill(0xffffff);
        flashed++;
      }
    }
  }

  /** A random drawn unit that reaches `dist` ahead, for tracer origins; -1 if none. */
  pickShooter(dist: number, ranges: readonly number[]): number {
    if (this.shown === 0) return -1;
    for (let tries = 0; tries < 6; tries++) {
      const i = Math.floor(Math.random() * this.shown);
      if (ranges[this.tier[i]] >= dist) return i;
    }
    return -1;
  }

  shooterX(i: number): number {
    return this.x + this.ox[i];
  }

  shooterY(i: number): number {
    return this.y + this.oy[i] - 14;
  }

  shooterTier(i: number): number {
    return this.tier[i];
  }

  /** Burst every unit into blood (defeat). */
  wipe(fx: Effects, roadX: number, distance: number): void {
    for (let i = 0; i < this.shown; i++) {
      const sx = this.x + this.ox[i];
      const sy = this.y + this.oy[i];
      fx.decal(sx - roadX, distance + (this.y - sy), HUMAN_BLOOD, 0.5);
      this.sprites[i].setVisible(false);
      this.tier[i] = -1;
    }
    this.shown = 0;
  }
}
