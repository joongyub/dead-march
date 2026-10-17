import type * as THREE from 'three';
import { quality } from '../core/quality';
import { TIER_COUNT } from '../sim/types';
import { ActorPool } from './ActorPool';
import type { Fx3D } from './Fx3D';
import { MUZZLE, gunnerModel, soldierModel, survivorModel, tankModel } from './models';

/** Most units drawn for the player's army; the real army size is the number above it. */
export const MAX_CROWD = 90;
const GOLDEN_ANGLE = 2.39996323;
const HUMAN_BLOOD = 0x9a1020;
/** Pool sizes per tier: live units plus room for the fallen. */
const CAPACITY = [150, 140, 110, 40];
const POSE = ['pistol', 'rifle', 'mg', 'tank'];
const HEIGHT = [40, 42, 46, 32];
/** Models are built at road scale; on screen the army reads better a little bigger than its footprint. */
export const UNIT_SCALE = 1.2;
const SPREAD = 1.15;
/** Tanks are drawn a little smaller than the rest so a tank column still reads as an army. */
const TIER_SCALE = [1, 1, 1, 0.8];
/** Ground each drawn unit takes, in survivors, and the ground one survivor takes (world units²). */
const FOOTPRINT = [1, 1.1, 1.4, 4.5];
const SURVIVOR_AREA = 400;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * The army in 3D: up to MAX_CROWD representative units in a sunflower formation, tanks in the
 * middle and survivors on the edge (they die first). New units run in from the front, merged units
 * hop into the middle, and fallen ones drop where they stood and bleed.
 */
export class Crowd3D {
  private readonly pools: ActorPool[] = [];
  private readonly tier = new Int8Array(MAX_CROWD).fill(-1);
  private readonly slot = new Int16Array(MAX_CROWD).fill(-1);
  private readonly ox = new Float32Array(MAX_CROWD);
  private readonly oz = new Float32Array(MAX_CROWD);
  private readonly tx = new Float32Array(MAX_CROWD);
  private readonly tz = new Float32Array(MAX_CROWD);
  private readonly pop = new Float32Array(MAX_CROWD);
  private readonly kick = new Float32Array(MAX_CROWD);
  private readonly jitter = new Float32Array(MAX_CROWD);
  private readonly order = new Int8Array(MAX_CROWD);
  private readonly display = new Int32Array(TIER_COUNT);
  private readonly lastCounts = new Int32Array(TIER_COUNT).fill(-1);
  private shown = 0;
  private slotsRadius = -1;
  private lastPower = -1;
  private lastCap = -1;
  private radius = 40;
  private lastX = 360;
  private lean = 0;
  /** World position of the crowd center, updated every frame. */
  x = 360;
  z = 0;

  constructor(scene: THREE.Scene, private readonly fx: Fx3D) {
    const models = [survivorModel(), soldierModel(), gunnerModel(), tankModel()];
    for (let t = 0; t < TIER_COUNT; t++) {
      const pool = new ActorPool(models[t], CAPACITY[t], { center: HEIGHT[t] / 2, blood: t === 3 ? 0x2a2420 : HUMAN_BLOOD, shadow: t === 3 ? 62 : 24 }, fx);
      this.pools.push(pool);
      scene.add(pool.mesh);
    }
    for (let i = 0; i < MAX_CROWD; i++) this.jitter[i] = (Math.random() - 0.5) * 0.16;
  }

  get count(): number {
    return this.shown;
  }

  reset(): void {
    for (const p of this.pools) p.reset();
    this.tier.fill(-1);
    this.slot.fill(-1);
    this.lastCounts.fill(-1);
    this.shown = 0;
    this.slotsRadius = -1;
    this.lastPower = -1;
    this.lastCap = -1;
  }

  /** Brings the drawn units in line with the army. Cheap when nothing changed. */
  sync(counts: readonly number[], power: number, radius: number): void {
    this.radius = radius;
    let same = true;
    for (let i = 0; i < TIER_COUNT; i++) if (counts[i] !== this.lastCounts[i]) same = false;
    // Low-spec mode shows fewer units (core/quality.ts).
    const cap = Math.round(MAX_CROWD * quality.unitScale);
    if (same && radius === this.slotsRadius && cap === this.lastCap) return;
    this.lastCap = cap;
    const lost = this.lastPower >= 0 && power < this.lastPower;
    this.lastPower = power;
    for (let i = 0; i < TIER_COUNT; i++) this.lastCounts[i] = counts[i];

    // How many of each tier to draw: all of them if they fit in the crowd's circle without piling up
    // (tanks take several survivors' room) and in the unit budget, otherwise proportionally, at least one each.
    const rx = radius * SPREAD;
    const rz = radius * 0.85 * SPREAD;
    const room = Math.max(8, (Math.PI * rx * rz) / SURVIVOR_AREA);
    let total = 0;
    let ground = 0;
    for (let i = 0; i < TIER_COUNT; i++) {
      total += counts[i];
      ground += counts[i] * FOOTPRINT[i];
    }
    const fit = Math.min(1, cap / Math.max(1, total), room / Math.max(1, ground));
    let drawn = 0;
    for (let i = TIER_COUNT - 1; i >= 0; i--) {
      let d = counts[i];
      if (fit < 1) d = counts[i] > 0 ? Math.max(1, Math.floor(counts[i] * fit)) : 0;
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
      if (next === prev) continue;
      if (prev < 0) {
        // New unit: runs in from just ahead of the crowd.
        this.ox[i] = (Math.random() - 0.5) * radius * 1.4;
        this.oz[i] = -radius - 40 - Math.random() * 50;
        this.pop[i] = 0.6;
      } else {
        // Promoted by a merge: a flash and a bounce where it stands.
        this.pools[prev].release(this.slot[i]);
        this.pop[i] = 1;
        if (glows++ < 5) {
          const x = this.x + this.ox[i];
          const z = this.z + this.oz[i];
          this.fx.glow(x, 20, z, 70 + next * 30, 0xfff1a8, 0.25);
          this.fx.sparks(x, 20, z, 3, 0xffe080, 260, 0.35);
        }
      }
      this.tier[i] = next;
      this.slot[i] = this.pools[next].alloc();
      this.kick[i] = 0;
    }
    for (let i = n; i < this.shown; i++) {
      const t = this.tier[i];
      const s = this.slot[i];
      if (t >= 0 && s >= 0) {
        const pool = this.pools[t];
        if (lost) {
          // Fallen: knocked back toward the camera, bleeding.
          pool.kill(s, (Math.random() - 0.5) * 120, 180 + Math.random() * 160, 90 + Math.random() * 160, 6 + Math.random() * 5, (Math.random() - 0.5) * 6);
          this.fx.gore(pool.x[s], 20, pool.z[s], t === 3 ? 0x3a3230 : HUMAN_BLOOD, t === 3 ? 1.4 : 0.8, 0, 1);
          if (t === 3) this.fx.explosion(pool.x[s], 0, pool.z[s], 0.7);
        } else {
          pool.merge(s, this.x, this.z - radius * 0.1);
        }
      }
      this.tier[i] = -1;
      this.slot[i] = -1;
    }
    this.shown = n;

    // Sunflower layout where each unit gets ground in proportion to its size.
    this.slotsRadius = radius;
    let area = 0;
    for (let i = 0; i < n; i++) area += FOOTPRINT[this.order[i]];
    let acc = 0;
    for (let i = 0; i < n; i++) {
      const w = FOOTPRINT[this.order[i]];
      const u = Math.sqrt((acc + w / 2) / area);
      acc += w;
      const a = i * GOLDEN_ANGLE;
      this.tx[i] = Math.cos(a) * u * rx;
      this.tz[i] = Math.sin(a) * u * rz;
    }
  }

  /** Places every unit around the crowd center (world x, world z). */
  update(dt: number, x: number, z: number, marching: boolean): void {
    // Lean into sideways moves.
    const vx = dt > 0 ? (x - this.lastX) / dt : 0;
    this.lastX = x;
    this.lean += (Math.max(-0.25, Math.min(0.25, -vx * 0.0006)) - this.lean) * Math.min(1, dt * 10);
    this.x = x;
    this.z = z;
    const k = 1 - Math.exp(-dt * 9);
    const rate = marching ? 13 : 3;
    const swing = marching ? 0.75 : 0.12;
    for (let i = 0; i < this.shown; i++) {
      const s = this.slot[i];
      if (s < 0) continue;
      const t = this.tier[i];
      const pool = this.pools[t];
      this.ox[i] += (this.tx[i] - this.ox[i]) * k;
      this.oz[i] += (this.tz[i] - this.oz[i]) * k;
      if (this.kick[i] > 0) this.kick[i] = Math.max(0, this.kick[i] - dt * 60);
      if (this.pop[i] > 0) this.pop[i] = Math.max(0, this.pop[i] - dt * 3.5);
      pool.cycle[s] += dt * rate * (t === 3 ? 0 : 1);
      pool.swing[s] = t === 3 ? 0 : swing;
      const bob = Math.abs(Math.sin(pool.cycle[s]));
      pool.x[s] = x + this.ox[i];
      pool.z[s] = z + this.oz[i] + this.kick[i];
      // Pop: new and promoted units bounce up and settle.
      const pop = this.pop[i];
      pool.y[s] = (marching && t < 3 ? bob * 2.2 : 0) + Math.sin(pop * Math.PI) * 18;
      pool.scale[s] = UNIT_SCALE * TIER_SCALE[t] * (1 + pop * 0.5);
      pool.yaw[s] = this.jitter[i];
      pool.roll[s] = t === 3 ? this.lean * 0.3 : this.lean;
      if (pool.flash[s] > 0) pool.flash[s] = Math.max(0, pool.flash[s] - dt * 12);
    }
    for (const p of this.pools) {
      p.update(dt);
      p.flush();
    }
  }

  /** White hit flash on the front units (the ones touching the enemy), knocked back a little. */
  hitFront(strength = 1): void {
    let flashed = 0;
    const limit = 8 + Math.round(strength * 8);
    for (let i = 0; i < this.shown && flashed < limit; i++) {
      if (this.oz[i] < -this.radius * 0.2 && Math.random() < 0.5) {
        const s = this.slot[i];
        if (s < 0) continue;
        this.pools[this.tier[i]].flash[s] = 1;
        this.kick[i] = Math.max(this.kick[i], 10 * strength);
        flashed++;
      }
    }
  }

  /** A random drawn unit whose weapon reaches `dist` ahead, for tracer origins; -1 if none. */
  pickShooter(dist: number, ranges: readonly number[]): number {
    if (this.shown === 0) return -1;
    for (let tries = 0; tries < 6; tries++) {
      const i = Math.floor(Math.random() * this.shown);
      if (this.slot[i] >= 0 && ranges[this.tier[i]] >= dist) return i;
    }
    return -1;
  }

  shooterTier(i: number): number {
    return this.tier[i];
  }

  /** World position of a unit's gun muzzle. */
  muzzle(i: number, out: Vec3): void {
    const t = this.tier[i];
    const pool = this.pools[t];
    const s = this.slot[i];
    const m = MUZZLE[POSE[t]];
    const k = pool.scale[s];
    out.x = pool.x[s] + m.x * k;
    out.y = pool.y[s] + m.y * k;
    out.z = pool.z[s] + m.z * k;
  }

  /** Recoil: the shooter jolts back. */
  recoil(i: number, amount: number): void {
    this.kick[i] = Math.max(this.kick[i], amount);
  }

  /** Every unit falls (defeat). */
  wipe(): void {
    for (let i = 0; i < this.shown; i++) {
      const t = this.tier[i];
      const s = this.slot[i];
      if (t < 0 || s < 0) continue;
      const pool = this.pools[t];
      pool.kill(s, (Math.random() - 0.5) * 200, 200 + Math.random() * 300, 60 + Math.random() * 200, 5 + Math.random() * 6, (Math.random() - 0.5) * 8);
      this.fx.gore(pool.x[s], 20, pool.z[s], HUMAN_BLOOD, 0.8, 0, 1);
      this.tier[i] = -1;
      this.slot[i] = -1;
    }
    this.shown = 0;
  }

  /** Units on screen including the fallen (debug overlay). */
  get instances(): number {
    let n = 0;
    for (const p of this.pools) n += p.mesh.count;
    return n;
  }
}
