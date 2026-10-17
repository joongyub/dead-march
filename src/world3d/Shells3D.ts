import { audio } from '../audio/Audio';
import type { SimHorde } from '../sim/BattleSim';
import type { Vec3 } from './Crowd3D';
import type { Fx3D } from './Fx3D';
import type { World3D } from './World3D';
import type { Zombies3D } from './Zombies3D';

const MAX_SHELLS = 40;
/** Seconds between smoke puffs left behind a shell. */
const TRAIL_EVERY = 0.035;

/**
 * The shells the army lobs at a zombie group each time it passes a gate: glowing heads on high arcs
 * with smoke trails, each one blowing up where it lands. Drawn with the effect batches (no draw calls
 * of its own); the damage itself is the simulation's salvo, which lands at the same moment.
 */
export class Shells3D {
  private readonly horde: (SimHorde | null)[] = [];
  /** Seconds since launch (negative: still waiting its turn in the volley). */
  private readonly age = new Float32Array(MAX_SHELLS);
  private readonly flight = new Float32Array(MAX_SHELLS);
  private readonly x0 = new Float32Array(MAX_SHELLS);
  private readonly y0 = new Float32Array(MAX_SHELLS);
  private readonly z0 = new Float32Array(MAX_SHELLS);
  private readonly x1 = new Float32Array(MAX_SHELLS);
  /** Landing spot behind the horde's front, so it follows the horde as it walks. */
  private readonly dz = new Float32Array(MAX_SHELLS);
  /** The horde's front when last seen alive. */
  private readonly front = new Float32Array(MAX_SHELLS);
  private readonly peak = new Float32Array(MAX_SHELLS);
  private readonly trail = new Float32Array(MAX_SHELLS);
  private readonly spot: Vec3 = { x: 0, y: 0, z: 0 };
  private active = 0;

  constructor(
    private readonly fx: Fx3D,
    private readonly zombies: Zombies3D,
    private readonly world: World3D,
  ) {
    for (let i = 0; i < MAX_SHELLS; i++) this.horde.push(null);
  }

  reset(): void {
    for (let i = 0; i < MAX_SHELLS; i++) this.horde[i] = null;
    this.active = 0;
  }

  /**
   * Fires `count` shells from inside the army (centre x, z = -distance, radius r) at the horde; they
   * leave one after another and all come down within `flight` seconds, the first right at the end.
   */
  fire(h: SimHorde, x: number, z: number, r: number, count: number, flight: number): void {
    for (let k = 0; k < count; k++) {
      let i = -1;
      for (let j = 0; j < MAX_SHELLS; j++) {
        if (!this.horde[j]) {
          i = j;
          break;
        }
      }
      if (i < 0) return;
      this.horde[i] = h;
      this.active++;
      const delay = k * 0.022;
      // Landings spread over the last fifth of the flight, ending as the salvo's damage lands.
      const land = flight * (0.8 + 0.2 * (count > 1 ? 1 - k / (count - 1) : 1)) - 0.01;
      this.age[i] = -delay;
      this.flight[i] = Math.max(0.2, land - delay);
      this.x0[i] = x + (Math.random() - 0.5) * r * 1.4;
      this.y0[i] = 34;
      this.z0[i] = z - (Math.random() - 0.3) * r;
      if (this.zombies.spot(h, this.spot)) {
        this.x1[i] = this.spot.x + (Math.random() - 0.5) * 30;
        this.dz[i] = -this.spot.z - h.z + (Math.random() - 0.5) * 30;
      } else {
        this.x1[i] = h.x0 + Math.random() * (h.x1 - h.x0);
        this.dz[i] = Math.random() * 80;
      }
      this.front[i] = h.z;
      this.peak[i] = 160 + Math.min(500, (h.z + this.dz[i] + z) * 0.22);
      this.trail[i] = 0;
    }
  }

  update(dt: number): void {
    if (this.active === 0) return;
    const fx = this.fx;
    for (let i = 0; i < MAX_SHELLS; i++) {
      const h = this.horde[i];
      if (!h) continue;
      const before = this.age[i];
      const age = (this.age[i] += dt);
      if (age < 0) continue;
      if (before <= 0) {
        // Leaves the army: muzzle flash, a puff of smoke and the boom.
        fx.flash(this.x0[i], this.y0[i] + 10, this.z0[i], 90, 0xffd27a);
        fx.glow(this.x0[i], this.y0[i], this.z0[i], 120, 0xffb050, 0.12, 0.6);
        fx.smoke(this.x0[i], this.y0[i] + 20, this.z0[i], 70, 0x5a5048, 0.8, 0.5, 80);
        audio.play('cannon', 0.8);
      }
      if (h.active) this.front[i] = h.z;
      const t = Math.min(1, age / this.flight[i]);
      const zEnd = -(this.front[i] + this.dz[i]);
      const x = this.x0[i] + (this.x1[i] - this.x0[i]) * t;
      const z = this.z0[i] + (zEnd - this.z0[i]) * t;
      const y = this.y0[i] * (1 - t) + this.peak[i] * 4 * t * (1 - t);
      if (t >= 1) {
        this.land(i, h, x, z);
        continue;
      }
      fx.halo(x, y, z, 46, 0xffb040, 0.85);
      fx.halo(x, y, z, 18, 0xffffff, 1);
      this.trail[i] -= dt;
      if (this.trail[i] <= 0) {
        this.trail[i] = TRAIL_EVERY;
        fx.smoke(x, y, z, 26, 0x6a6058, 0.45, 0.4, 10);
        fx.ember(x, y, z, 0xffa040);
      }
    }
  }

  private land(i: number, h: SimHorde, x: number, z: number): void {
    this.horde[i] = null;
    this.active--;
    this.fx.explosion(x, 0, z, 0.7);
    this.zombies.blast(h, x, z);
    this.world.shake(0.16);
    this.world.punch(1.4);
    audio.play('explode', 0.7);
  }
}
