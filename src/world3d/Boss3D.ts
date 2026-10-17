import type * as THREE from 'three';
import type { SimBoss } from '../sim/BattleSim';
import { ActorPool } from './ActorPool';
import type { Vec3 } from './Crowd3D';
import { Frame } from './fxAtlas';
import type { Fx3D } from './Fx3D';
import { bossModel } from './models';

const LUNGE_PERIOD = 0.8;
const BOSS_BLOOD = 0x6e0f22;

/**
 * The boss at the end of the road: lumbers in, lunges and stomps (shockwave, cracks, the camera
 * shakes), flashes when shot, and topples over in a shower of gore when it dies.
 */
export class Boss3D {
  private readonly pools = new Map<string, ActorPool>();
  private pool: ActorPool | null = null;
  private boss: SimBoss | null = null;
  private slot = -1;
  private time = 0;
  private lastHp = 0;
  private hurt = 0;
  private lungePhase = 0;
  private dead = false;
  private height = 100;
  /** Set for one frame when a lunge lands, so the scene can shake the camera and hurt the crowd. */
  landed = false;
  /** Set for one frame when it dies. */
  died = false;
  x = 360;
  z = 0;

  constructor(private readonly scene: THREE.Scene, private readonly fx: Fx3D) {}

  /** Prepares this stage's boss (models are built the first time each kind is needed). */
  reset(boss: SimBoss): void {
    for (const p of this.pools.values()) p.reset();
    let pool = this.pools.get(boss.kindId);
    if (!pool) {
      const geometry = bossModel(boss.kindId, boss.kind.radius);
      geometry.computeBoundingBox();
      const h = geometry.boundingBox!.max.y;
      pool = new ActorPool(geometry, 1, { center: h / 2, blood: BOSS_BLOOD, shadow: boss.kind.radius * 2.2 }, this.fx);
      this.pools.set(boss.kindId, pool);
      this.scene.add(pool.mesh);
    }
    this.pool = pool;
    this.boss = boss;
    this.slot = -1;
    this.time = 0;
    this.lastHp = boss.hp;
    this.hurt = 0;
    this.lungePhase = 0;
    this.dead = false;
    this.landed = false;
    this.died = false;
    pool.mesh.geometry.computeBoundingBox();
    this.height = pool.mesh.geometry.boundingBox!.max.y;
  }

  get visible(): boolean {
    return this.slot >= 0 && !this.dead;
  }

  update(dt: number): void {
    this.landed = false;
    this.died = false;
    const b = this.boss;
    const pool = this.pool;
    if (!b || !pool) return;
    if (!this.dead && !b.active && b.hp <= 0 && this.slot >= 0) this.die();
    if (!this.dead && b.active) {
      if (this.slot < 0) this.slot = pool.alloc();
      const s = this.slot;
      if (s >= 0) this.place(dt, b, pool, s);
    }
    pool.update(dt);
    pool.flush();
  }

  private place(dt: number, b: SimBoss, pool: ActorPool, s: number): void {
    this.time += dt;
    let lunge = 0;
    if (b.attacking) {
      const before = this.lungePhase;
      this.lungePhase = (this.lungePhase + dt / LUNGE_PERIOD) % 1;
      if (before < 0.5 && this.lungePhase >= 0.5) this.landed = true;
      lunge = Math.max(0, Math.sin(this.lungePhase * Math.PI));
      pool.cycle[s] += dt * 9;
      pool.swing[s] = 0.45;
    } else {
      this.lungePhase = 0;
      pool.cycle[s] += dt * 4;
      pool.swing[s] = 0.7;
    }
    this.x = 360 + Math.sin(this.time * 1.3) * 18;
    this.z = -b.z + lunge * 45;
    pool.x[s] = this.x;
    pool.z[s] = this.z;
    pool.y[s] = b.attacking ? lunge * 10 : Math.abs(Math.sin(pool.cycle[s])) * 5;
    pool.yaw[s] = Math.PI + Math.sin(this.time * 0.9) * 0.12;
    pool.pitch[s] = -lunge * 0.28;
    if (b.hp < this.lastHp) {
      this.lastHp = b.hp;
      this.hurt = 0.1;
    }
    if (this.hurt > 0) this.hurt -= dt;
    pool.flash[s] = this.hurt > 0 && Math.floor(this.time * 30) % 2 === 0 ? 0.7 : Math.max(0, pool.flash[s] - dt * 10);
    if (this.landed) this.stomp();
  }

  /** Lunge lands: the ground cracks and a shockwave rolls toward the army. */
  private stomp(): void {
    const r = this.boss!.kind.radius;
    const fz = this.z + r * 0.8;
    this.fx.shock(this.x, fz, r * 4, 0xffc890, 0.4);
    this.fx.decal(this.x, fz, r * 2.2, 0x1a1412, Frame.Crack, 0.8, 4);
    for (let k = 0; k < 4; k++) this.fx.dust(this.x + (Math.random() - 0.5) * r * 2, fz + (Math.random() - 0.5) * r, r * 1.3, 0x8a7a68, 0.5);
    this.fx.chunks(this.x, 10, fz, 5, 0x4a4440, 380, 7, 0, 1, 1.2);
  }

  private die(): void {
    const pool = this.pool!;
    const s = this.slot;
    this.dead = true;
    this.died = true;
    const r = this.boss!.kind.radius;
    const h = this.height;
    // Topples backward in slow motion (the scene slows time).
    pool.kill(s, 0, 380, -160, 2.6, (Math.random() - 0.5) * 1.5);
    for (let k = 0; k < 3; k++) {
      this.fx.explosion(this.x + (Math.random() - 0.5) * r, h * (0.2 + Math.random() * 0.5), this.z + (Math.random() - 0.5) * r * 0.5, 1.4);
    }
    for (let k = 0; k < 3; k++) this.fx.gore(this.x + (Math.random() - 0.5) * r, h * 0.5, this.z, BOSS_BLOOD, 3, (Math.random() - 0.5) * 2, -1);
    this.fx.chunks(this.x, h * 0.5, this.z, 24, BOSS_BLOOD, 700, 9, 0, 0, 2.2);
    this.fx.shock(this.x, this.z, r * 9, 0xffffff, 0.6);
    this.fx.shock(this.x, this.z, r * 6, 0xff6060, 0.45);
    this.fx.glow(this.x, h * 0.5, this.z, r * 6, 0xffd080, 0.5, 1);
  }

  /** A point on the boss for shots to hit. */
  target(out: Vec3): void {
    const r = this.boss!.kind.radius;
    out.x = this.x + (Math.random() - 0.5) * r;
    out.y = this.height * (0.3 + Math.random() * 0.45);
    out.z = this.z + r * 0.3;
  }

  /** Where the boss name and health would hang over it. */
  top(out: Vec3): void {
    out.x = this.x;
    out.y = this.height + 30;
    out.z = this.z;
  }
}
