import type * as THREE from 'three';
import { audio } from '../audio/Audio';
import { quality } from '../core/quality';
import type { SimHorde } from '../sim/BattleSim';
import { ActorPool } from './ActorPool';
import { MAX_CROWD, UNIT_SCALE, type Vec3 } from './Crowd3D';
import type { Fx3D } from './Fx3D';
import { zombieModel } from './models';

/** Live zombies drawn at once, all hordes together. Army (90) + zombies stays within 250 units. */
export const MAX_ZOMBIES = 160;
/** Low-spec mode draws at most this many units in all (CLAUDE.md); zombies get what the army leaves. */
const LOW_SPEC_UNITS = 120;
const MAX_PER_HORDE = 48;
const MAX_HORDES = 8;
const KILLS_PER_FRAME = 3;
const ZOMBIE_BLOOD = 0x6e0f22;
/** Rotting skin and torn clothes, for the pieces that fly off. */
const ZOMBIE_SKIN = 0x7d9a52;
const ZOMBIE_CLOTH = 0x4a4660;
const KINDS = ['walker', 'runner', 'exploder', 'brute'];
const CAPACITY: Record<string, number> = { walker: 240, runner: 220, exploder: 100, brute: 90 };
const HEIGHT: Record<string, number> = { walker: 40, runner: 38, exploder: 42, brute: 62 };
const SPACING: Record<string, number> = { walker: 32, runner: 32, exploder: 42, brute: 64 };
const PER_HORDE: Record<string, number> = { walker: 44, runner: 40, exploder: 28, brute: 18 };
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
  /** Stagger from the last hits (0..1): leans back, twists, arms flail; and which way it twists. */
  st: Float32Array;
  tw: Float32Array;
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
        st: new Float32Array(MAX_PER_HORDE), tw: new Float32Array(MAX_PER_HORDE),
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
    const over = this.liveCount - this.budget;
    if (over > 0) this.trim(over);
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
      // Front zombies (low index) die first, a few per frame: a shell wiping out a group ripples
      // through it instead of every body (and its blood) landing on the same frame.
      for (let n = 0; v.alive > target && n < KILLS_PER_FRAME; n++) {
        const j = v.k - v.alive;
        this.kill(v, j);
        v.alive--;
      }

      const moving = h.aggro && !h.held;
      const rate = moving ? WALK_RATE[h.kindId] ?? 6 : h.held ? 10 : 1.5;
      const swing = moving ? 0.75 : h.held ? 0.95 : 0.1;
      const exploder = h.kindId === 'exploder';
      for (let j = v.k - v.alive; j < v.k; j++) {
        const s = v.slot[j];
        if (s < 0) continue;
        const ph = v.ph[j];
        if (v.kb[j] > 0) v.kb[j] = Math.max(0, v.kb[j] - dt * 50);
        const st = v.st[j] > 0 ? (v.st[j] = Math.max(0, v.st[j] - dt * 4.5)) : 0;
        pool.cycle[s] += dt * (rate + st * 20);
        pool.swing[s] = Math.min(1, swing + st * 0.8);
        const sway = Math.sin(this.time * 2.2 + ph) * 3;
        // At the front line they lunge at the army again and again, but the gap is never crossed.
        const lunge = h.held ? Math.max(0, Math.sin(this.time * 7 + ph * 3)) * 22 : 0;
        pool.x[s] = v.dx[j] + sway + v.tw[j] * st * 6;
        pool.z[s] = -(h.z + v.dz[j]) - v.kb[j] + lunge;
        pool.y[s] = (moving ? Math.abs(Math.sin(pool.cycle[s])) * 2 : 0) + st * 3;
        pool.yaw[s] = Math.PI + Math.sin(this.time * 1.3 + ph) * 0.18 + v.tw[j] * st * 0.6;
        // Hits snap the body back; lunges throw it forward.
        pool.pitch[s] = -st * 0.55 + lunge * 0.012;
        pool.roll[s] = v.tw[j] * st * 0.3;
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

  /** How many zombies may be drawn now (fewer in low-spec mode, core/quality.ts). */
  private get budget(): number {
    return quality.unitScale < 1 ? LOW_SPEC_UNITS - Math.round(MAX_CROWD * quality.unitScale) : MAX_ZOMBIES;
  }

  /** Low-spec mode came on mid-battle: quietly drops back-row zombies until the drawn count fits. */
  private trim(over: number): void {
    let removed = true;
    while (over > 0 && removed) {
      removed = false;
      for (const v of this.vis) {
        if (over <= 0) break;
        if (!v.pool || v.alive <= 1) continue;
        const s = v.slot[v.k - 1];
        if (s >= 0) {
          v.pool.release(s);
          over--;
        }
        v.k--;
        v.alive--;
        removed = true;
      }
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
    const budget = this.budget - this.liveCount;
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
      v.st[j] = 0;
      v.tw[j] = 0;
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
    const blasted = v.blastAge < 0.35;
    if (blasted) {
      dx = x - v.blastX;
      dz = z - v.blastZ;
      power = 1.8;
    } else if (h.held) {
      // Shot point-blank at the front line: thrown back hard.
      power = 1.35;
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
    const chest = (brute ? 40 : 26) * sc;
    const head = (brute ? 58 : 38) * sc;
    const roll = Math.random();
    if (blasted) {
      // Torn apart: limbs and rags fly off, the rest is thrown high and tumbles.
      this.fx.chunks(x, chest, z, brute ? 6 : 4, ZOMBIE_SKIN, 380, brute ? 7 : 5, dx, dz, 1.6);
      this.fx.chunks(x, chest, z, 2, ZOMBIE_CLOTH, 320, brute ? 7 : 5, dx, dz, 1.6);
      this.fx.spurt(x, chest, z, ZOMBIE_BLOOD, dx, dz, 1.4);
    } else if (!brute && roll < 0.3) {
      // Head shot: the head pops off and blood fountains from the neck.
      this.fx.chunks(x, head, z, 1, ZOMBIE_SKIN, 300, 7 * sc, dx * 0.4, dz * 0.4, 1.8);
      this.fx.spurt(x, head - 4, z, ZOMBIE_BLOOD, 0, 0, 1.2);
      power *= 0.7;
    } else {
      this.fx.spurt(x, chest, z, ZOMBIE_BLOOD, dx, dz, brute ? 1.3 : 0.9);
    }
    const speed = (brute ? 180 : 300) * power * (0.8 + Math.random() * 0.5);
    const lift = (brute ? 260 : 340) * power * (0.8 + Math.random() * 0.5);
    // Thrown backward, flipping head over heels, with a twist either way.
    pool.kill(s, dx * speed + (Math.random() - 0.5) * 120, lift, dz * speed, -(6 + Math.random() * 8) * (blasted ? 1.6 : 1), (Math.random() - 0.5) * (blasted ? 16 : 8));
    this.fx.gore(x, chest, z, ZOMBIE_BLOOD, brute ? 1.5 : 0.9, dx, dz);
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

  /** Where a shell aimed at this horde comes down: a random live zombie anywhere in it. Returns false if none is drawn. */
  spot(h: SimHorde, out: Vec3): boolean {
    const v = this.find(h);
    if (!v || v.alive === 0 || !v.pool) return false;
    const s = v.slot[v.k - v.alive + Math.floor(Math.random() * v.alive)];
    if (s < 0) return false;
    out.x = v.pool.x[s];
    out.y = 0;
    out.z = v.pool.z[s];
    return true;
  }

  /** A shot landed on zombie j: white flash, knocked back a step, staggers and twists away from it. */
  hit(h: SimHorde, j: number, push: number): void {
    const v = this.find(h);
    if (!v || !v.pool) return;
    const s = v.slot[j];
    if (s < 0) return;
    v.pool.flash[s] = 1;
    v.kb[j] = Math.min(30, v.kb[j] + push);
    v.st[j] = Math.min(1, v.st[j] + 0.35 + push * 0.04);
    v.tw[j] = Math.random() < 0.5 ? -1 : 1;
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
