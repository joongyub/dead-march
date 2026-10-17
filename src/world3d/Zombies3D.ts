import type * as THREE from 'three';
import { audio } from '../audio/Audio';
import { quality } from '../core/quality';
import type { SimHorde } from '../sim/BattleSim';
import { ActorPool } from './ActorPool';
import { UNIT_SCALE, type Vec3 } from './Crowd3D';
import type { Fx3D } from './Fx3D';
import { zombieModel } from './models';

/** Live zombies drawn at once, all hordes together. Army (90) + zombies stays within 200 units. */
export const MAX_ZOMBIES = 110;
const MAX_PER_HORDE = 32;
const MAX_HORDES = 8;
const ZOMBIE_BLOOD = 0x6e0f22;
const KINDS = ['walker', 'runner', 'exploder', 'brute'];
const CAPACITY: Record<string, number> = { walker: 170, runner: 160, exploder: 70, brute: 60 };
const HEIGHT: Record<string, number> = { walker: 40, runner: 38, exploder: 42, brute: 62 };
const SPACING: Record<string, number> = { walker: 36, runner: 36, exploder: 46, brute: 70 };
const PER_HORDE: Record<string, number> = { walker: 30, runner: 26, exploder: 20, brute: 12 };
const WALK_RATE: Record<string, number> = { walker: 6, runner: 15, exploder: 6, brute: 4.5 };
/** Hordes come into view this far ahead (the fog hides them farther out). */
export const VIEW_AHEAD = 2600;

interface HordeVis {
  horde: SimHorde | null;
  pool: ActorPool | null;
  k: number;
  alive: number;
  slot: Int16Array;
  dx: Float32Array;
  dz: Float32Array;
  ph: Float32Array;
  kb: Float32Array;
  /** Where the last big blast hit this horde, and how long ago (kills fly away from it). */
  blastX: number;
  blastZ: number;
  blastAge: number;
}

/**
 * Each zombie group drawn as up to 32 representative zombies plus its real count (a Phaser label).
 * As the count drops the front rows die first: shot ones are thrown back, blown-up ones fly apart.
 */
export class Zombies3D {
  private readonly pools = new Map<string, ActorPool>();
  readonly vis: HordeVis[] = [];
  private time = 0;
  private crowdX = 360;
  private crowdZ = 0;

  constructor(scene: THREE.Scene, private readonly fx: Fx3D) {
    for (const kind of KINDS) {
      const pool = new ActorPool(zombieModel(kind), CAPACITY[kind], { center: HEIGHT[kind] / 2, blood: ZOMBIE_BLOOD, shadow: kind === 'brute' ? 40 : 24 }, fx);
      this.pools.set(kind, pool);
      scene.add(pool.mesh);
    }
    for (let i = 0; i < MAX_HORDES; i++) {
      this.vis.push({
        horde: null, pool: null, k: 0, alive: 0,
        slot: new Int16Array(MAX_PER_HORDE), dx: new Float32Array(MAX_PER_HORDE), dz: new Float32Array(MAX_PER_HORDE),
        ph: new Float32Array(MAX_PER_HORDE), kb: new Float32Array(MAX_PER_HORDE),
        blastX: 0, blastZ: 0, blastAge: 9,
      });
    }
  }

  reset(): void {
    for (const p of this.pools.values()) p.reset();
    for (const v of this.vis) {
      v.horde = null;
      v.pool = null;
      v.k = 0;
      v.alive = 0;
    }
  }

  /** Live zombies drawn now. */
  get liveCount(): number {
    let n = 0;
    for (const p of this.pools.values()) n += p.live;
    return n;
  }

  get instances(): number {
    let n = 0;
    for (const p of this.pools.values()) n += p.mesh.count;
    return n;
  }

  update(dt: number, hordes: readonly SimHorde[], distance: number, crowdX: number): void {
    this.time += dt;
    this.crowdX = crowdX;
    this.crowdZ = -distance;
    for (const h of hordes) {
      if (!h.active || h.z - distance > VIEW_AHEAD || h.z - distance < -300) continue;
      if (this.find(h)) continue;
      this.attach(h);
    }

    for (const v of this.vis) {
      const h = v.horde;
      const pool = v.pool;
      if (!h || !pool) continue;
      v.blastAge += dt;
      const target = h.count > 0 ? Math.max(1, Math.ceil((h.count / h.count0) * v.k)) : 0;
      // Front zombies (low index) die first.
      while (v.alive > target) {
        const j = v.k - v.alive;
        this.kill(v, j);
        v.alive--;
      }

      const moving = h.aggro && !h.engaged;
      const rate = moving ? WALK_RATE[h.kindId] ?? 6 : h.engaged ? 9 : 1.5;
      const swing = moving ? 0.75 : h.engaged ? 0.35 : 0.1;
      const exploder = h.kindId === 'exploder';
      for (let j = v.k - v.alive; j < v.k; j++) {
        const s = v.slot[j];
        if (s < 0) continue;
        const ph = v.ph[j];
        if (v.kb[j] > 0) v.kb[j] = Math.max(0, v.kb[j] - dt * 50);
        pool.cycle[s] += dt * rate;
        pool.swing[s] = swing;
        const sway = Math.sin(this.time * 2.2 + ph) * 3;
        const shake = h.engaged ? (Math.random() - 0.5) * 3 : 0;
        pool.x[s] = v.dx[j] + sway + shake;
        pool.z[s] = -(h.z + v.dz[j]) - v.kb[j];
        pool.y[s] = moving ? Math.abs(Math.sin(pool.cycle[s])) * 2 : 0;
        pool.yaw[s] = Math.PI + Math.sin(this.time * 1.3 + ph) * 0.18;
        pool.pitch[s] = h.engaged ? 0.12 : 0;
        const flash = Math.max(0, pool.flash[s] - dt * 14);
        // Exploders throb as they close in.
        pool.flash[s] = exploder && h.aggro ? Math.max(flash, 0.12 + Math.sin(this.time * 9 + ph) * 0.1) : flash;
      }
      if (v.alive === 0 || h.z - distance < -400) this.release(v);
    }
    for (const p of this.pools.values()) {
      p.update(dt);
      p.flush();
    }
  }

  private find(h: SimHorde): HordeVis | null {
    for (const v of this.vis) if (v.horde === h) return v;
    return null;
  }

  private attach(h: SimHorde): void {
    let v: HordeVis | null = null;
    for (const c of this.vis) {
      if (!c.horde) {
        v = c;
        break;
      }
    }
    const pool = this.pools.get(h.kindId) ?? this.pools.get('walker')!;
    if (!v) return;
    // Low-spec mode shows fewer zombies (core/quality.ts).
    const budget = Math.round(MAX_ZOMBIES * quality.unitScale) - this.liveCount;
    const k = Math.min(h.count, PER_HORDE[h.kindId] ?? 24, MAX_PER_HORDE, budget);
    if (k <= 0) return;
    v.horde = h;
    v.pool = pool;
    v.k = k;
    v.alive = k;
    v.blastAge = 9;
    const spacing = SPACING[h.kindId] ?? 28;
    const width = Math.max(spacing, h.x1 - h.x0 - spacing * 0.8);
    const cols = Math.max(1, Math.min(Math.floor(width / spacing), Math.ceil(Math.sqrt(k * 3))));
    const rows = Math.ceil(k / cols);
    const depth = rows * spacing * 0.85;
    // Random spots inside the lane, then sorted front to back so the front ones die first.
    for (let j = 0; j < k; j++) {
      v.dx[j] = h.x0 + spacing * 0.4 + Math.random() * width;
      v.dz[j] = Math.random() * depth;
      v.ph[j] = Math.random() * Math.PI * 2;
      v.kb[j] = 0;
    }
    for (let a = 1; a < k; a++) {
      const dz = v.dz[a];
      const dx = v.dx[a];
      let b = a - 1;
      while (b >= 0 && v.dz[b] > dz) {
        v.dz[b + 1] = v.dz[b];
        v.dx[b + 1] = v.dx[b];
        b--;
      }
      v.dz[b + 1] = dz;
      v.dx[b + 1] = dx;
    }
    for (let j = 0; j < k; j++) {
      const s = pool.alloc();
      v.slot[j] = s;
      if (s < 0) continue;
      pool.x[s] = v.dx[j];
      pool.z[s] = -(h.z + v.dz[j]);
      pool.yaw[s] = Math.PI;
      pool.scale[s] = UNIT_SCALE * (0.92 + Math.random() * 0.16);
      pool.shade[s] = 0.85 + Math.random() * 0.25;
    }
  }

  private kill(v: HordeVis, j: number): void {
    const pool = v.pool!;
    const h = v.horde!;
    const s = v.slot[j];
    v.slot[j] = -1;
    if (s < 0 || !pool.isLive(s)) return;
    const x = pool.x[s];
    const z = pool.z[s];
    const sc = pool.scale[s];
    let dx = x - this.crowdX;
    let dz = z - this.crowdZ;
    let power = 1;
    if (v.blastAge < 0.35) {
      dx = x - v.blastX;
      dz = z - v.blastZ;
      power = 1.8;
    }
    const len = Math.sqrt(dx * dx + dz * dz) || 1;
    dx /= len;
    dz /= len;
    if (h.kindId === 'exploder') {
      audio.play('explode', 0.6);
      this.fx.explosion(x, 0, z, 0.75);
      this.fx.chunks(x, 25, z, 6, 0x98b83a, 420, 6, 0, 0, 1.4);
      this.fx.gore(x, 25, z, 0x5a7a20, 1.2, dx, dz);
      pool.release(s);
      return;
    }
    audio.play('zombieDie', 0.7);
    const brute = h.kindId === 'brute';
    const speed = (brute ? 180 : 300) * power * (0.8 + Math.random() * 0.5);
    pool.kill(s, dx * speed + (Math.random() - 0.5) * 120, (brute ? 260 : 340) * power * (0.8 + Math.random() * 0.5), dz * speed, -(6 + Math.random() * 8), (Math.random() - 0.5) * 8);
    this.fx.gore(x, (brute ? 40 : 26) * sc, z, ZOMBIE_BLOOD, brute ? 1.5 : 0.9, dx, dz);
  }

  private release(v: HordeVis): void {
    const pool = v.pool;
    if (pool) {
      for (let j = 0; j < v.k; j++) {
        const s = v.slot[j];
        if (s >= 0 && pool.isLive(s)) pool.release(s);
      }
    }
    v.horde = null;
    v.pool = null;
    v.k = 0;
    v.alive = 0;
  }

  /** World position of a random live front zombie of the horde (a shot's target). Returns its index or -1. */
  target(h: SimHorde, out: Vec3): number {
    const v = this.find(h);
    if (!v || v.alive === 0 || !v.pool) return -1;
    const front = v.k - v.alive;
    const j = front + Math.floor(Math.random() * Math.min(v.alive, 6));
    const s = v.slot[j];
    if (s < 0) return -1;
    const pool = v.pool;
    out.x = pool.x[s] + (Math.random() - 0.5) * 8;
    out.y = (h.kindId === 'brute' ? 42 : 26) * pool.scale[s];
    out.z = pool.z[s];
    return j;
  }

  /** A shot landed on zombie j: white flash, knocked back a step. */
  hit(h: SimHorde, j: number, push: number): void {
    const v = this.find(h);
    if (!v || !v.pool) return;
    const s = v.slot[j];
    if (s < 0) return;
    v.pool.flash[s] = 1;
    v.kb[j] = Math.min(24, v.kb[j] + push);
  }

  /** A shell or explosion went off at (x, z) in this horde: the next kills are thrown away from it. */
  blast(h: SimHorde, x: number, z: number): void {
    const v = this.find(h);
    if (!v) return;
    v.blastX = x;
    v.blastZ = z;
    v.blastAge = 0;
  }

  /** Where the horde's count label goes: above its front row. Returns false if it is not drawn. */
  labelPoint(i: number, out: Vec3): SimHorde | null {
    const v = this.vis[i];
    const h = v.horde;
    if (!h || v.alive === 0 || h.count <= 0) return null;
    out.x = (h.x0 + h.x1) / 2;
    out.y = h.kindId === 'brute' ? 120 : 82;
    out.z = -h.z;
    return h;
  }
}
