import * as THREE from 'three';
import { actorMaterial } from './actorMaterial';
import { Frame } from './fxAtlas';
import type { Fx3D } from './Fx3D';

const enum State {
  Free = 0,
  /** Placed by its owner every frame. */
  Live = 1,
  /** Thrown through the air after dying. */
  Flying = 2,
  /** Lying on the road, then sinking into it. */
  Down = 3,
  /** Hopping into the middle of the crowd (merged into a bigger unit). */
  Merging = 4,
}

export interface PoolStyle {
  /** Height of the model's middle at scale 1 (bodies spin around it). */
  center: number;
  blood: number;
  /** Blob shadow size at scale 1 (0: none). */
  shadow: number;
}

const GRAVITY = 1500;
const DOWN_TIME = 1.1;
const SINK_TIME = 0.7;

/**
 * One instanced mesh (one draw call) for every copy of one model: live actors placed by their owner,
 * and bodies the pool animates by itself after they die (thrown, bounce, lie, sink). Slots are stable
 * while used, so owners keep slot numbers; the GPU buffers are packed each frame.
 */
export class ActorPool {
  readonly mesh: THREE.InstancedMesh;
  private readonly data: THREE.InstancedBufferAttribute;
  private readonly cap: number;
  private readonly state: Uint8Array;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
  readonly yaw: Float32Array;
  readonly pitch: Float32Array;
  readonly roll: Float32Array;
  readonly scale: Float32Array;
  /** Walk cycle angle and swing amount (see actorMaterial). */
  readonly cycle: Float32Array;
  readonly swing: Float32Array;
  readonly flash: Float32Array;
  readonly shade: Float32Array;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly vz: Float32Array;
  private readonly spinX: Float32Array;
  private readonly spinZ: Float32Array;
  private readonly timer: Float32Array;
  private readonly age: Uint32Array;
  private readonly free: Int16Array;
  private freeCount = 0;
  private clock = 0;
  live = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();

  constructor(
    geometry: THREE.BufferGeometry,
    capacity: number,
    private readonly style: PoolStyle,
    private readonly fx: Fx3D,
  ) {
    this.cap = capacity;
    const f = () => new Float32Array(capacity);
    this.state = new Uint8Array(capacity);
    this.x = f();
    this.y = f();
    this.z = f();
    this.yaw = f();
    this.pitch = f();
    this.roll = f();
    this.scale = f();
    this.cycle = f();
    this.swing = f();
    this.flash = f();
    this.shade = f();
    this.vx = f();
    this.vy = f();
    this.vz = f();
    this.spinX = f();
    this.spinZ = f();
    this.timer = f();
    this.age = new Uint32Array(capacity);
    this.free = new Int16Array(capacity);
    this.data = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    this.data.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('iData', this.data);
    this.mesh = new THREE.InstancedMesh(geometry, actorMaterial(), capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.reset();
  }

  reset(): void {
    this.state.fill(State.Free);
    this.freeCount = 0;
    for (let i = this.cap - 1; i >= 0; i--) this.free[this.freeCount++] = i;
    this.live = 0;
    this.mesh.count = 0;
    this.mesh.visible = false;
  }

  /** A slot for a live actor, standing upright at the origin; -1 if the pool is full of live ones. */
  alloc(): number {
    let i: number;
    if (this.freeCount > 0) {
      i = this.free[--this.freeCount];
    } else {
      // Every slot is used: the oldest body makes room.
      i = -1;
      let oldest = 0xffffffff;
      for (let k = 0; k < this.cap; k++) {
        if (this.state[k] !== State.Live && this.age[k] < oldest) {
          oldest = this.age[k];
          i = k;
        }
      }
      if (i < 0) return -1;
    }
    this.state[i] = State.Live;
    this.age[i] = this.clock++;
    this.pitch[i] = 0;
    this.roll[i] = 0;
    this.yaw[i] = 0;
    this.scale[i] = 1;
    this.cycle[i] = Math.random() * Math.PI * 2;
    this.swing[i] = 0;
    this.flash[i] = 0;
    this.shade[i] = 1;
    this.live++;
    return i;
  }

  release(i: number): void {
    if (this.state[i] === State.Free) return;
    if (this.state[i] === State.Live) this.live--;
    this.state[i] = State.Free;
    this.free[this.freeCount++] = i;
  }

  isLive(i: number): boolean {
    return this.state[i] === State.Live;
  }

  /** Turns a live actor into a body thrown with this velocity and tumble. */
  kill(i: number, vx: number, vy: number, vz: number, spinX: number, spinZ: number): void {
    if (this.state[i] !== State.Live) return;
    this.live--;
    this.state[i] = State.Flying;
    this.age[i] = this.clock++;
    // Bodies turn around their middle, not their feet.
    this.y[i] += this.style.center * this.scale[i];
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.vz[i] = vz;
    this.spinX[i] = spinX;
    this.spinZ[i] = spinZ;
    this.swing[i] = 0.9;
    this.flash[i] = 1;
  }

  /** Hops a live actor into (tx, tz) and removes it (merged into a bigger unit). */
  merge(i: number, tx: number, tz: number): void {
    if (this.state[i] !== State.Live) return;
    this.live--;
    this.state[i] = State.Merging;
    this.timer[i] = 0.24;
    this.vx[i] = (tx - this.x[i]) / 0.24;
    this.vz[i] = (tz - this.z[i]) / 0.24;
    this.vy[i] = 0;
  }

  /** Bodies and merges move by themselves; call once per frame before flush(). */
  update(dt: number): void {
    for (let i = 0; i < this.cap; i++) {
      const st = this.state[i];
      if (st === State.Free || st === State.Live) continue;
      if (st === State.Merging) {
        this.timer[i] -= dt;
        const t = 1 - this.timer[i] / 0.24;
        this.x[i] += this.vx[i] * dt;
        this.z[i] += this.vz[i] * dt;
        this.y[i] = Math.sin(Math.min(1, t) * Math.PI) * 30;
        this.scale[i] *= 1 - dt * 2.5;
        this.flash[i] = t;
        if (this.timer[i] <= 0) this.release(i);
        continue;
      }
      if (this.flash[i] > 0) this.flash[i] = Math.max(0, this.flash[i] - dt * 8);
      const rest = 5 * this.scale[i];
      if (st === State.Flying) {
        this.vy[i] -= GRAVITY * dt;
        this.x[i] += this.vx[i] * dt;
        this.y[i] += this.vy[i] * dt;
        this.z[i] += this.vz[i] * dt;
        this.pitch[i] += this.spinX[i] * dt;
        this.roll[i] += this.spinZ[i] * dt;
        this.cycle[i] += dt * 18;
        if (this.y[i] <= rest && this.vy[i] < 0) {
          this.y[i] = rest;
          if (this.vy[i] < -260) {
            // First hard landing: bounce, splat.
            this.vy[i] *= -0.25;
            this.vx[i] *= 0.45;
            this.vz[i] *= 0.45;
            this.spinX[i] *= 0.4;
            this.spinZ[i] *= 0.4;
            this.fx.decal(this.x[i], this.z[i], 50 * this.scale[i], this.style.blood, Frame.Splat, 0.75);
            this.fx.dust(this.x[i], this.z[i], 40 * this.scale[i], 0x6a5a50, 0.35);
          } else {
            this.state[i] = State.Down;
            this.timer[i] = DOWN_TIME + SINK_TIME;
            this.swing[i] = 0;
          }
        }
      } else {
        // Down: slide to a stop, lie flat on the back or front, darken, then sink into the road.
        this.timer[i] -= dt;
        const k = Math.max(0, 1 - dt * 10);
        this.vx[i] *= k;
        this.vz[i] *= k;
        this.x[i] += this.vx[i] * dt;
        this.z[i] += this.vz[i] * dt;
        const flat = this.pitch[i] < 0 ? -Math.PI / 2 : Math.PI / 2;
        const wrap = Math.round((this.pitch[i] - flat) / (Math.PI * 2)) * Math.PI * 2;
        this.pitch[i] += (flat + wrap - this.pitch[i]) * Math.min(1, dt * 14);
        this.roll[i] += (Math.round(this.roll[i] / Math.PI) * Math.PI - this.roll[i]) * Math.min(1, dt * 14);
        this.shade[i] += (0.55 - this.shade[i]) * Math.min(1, dt * 3);
        if (this.timer[i] < SINK_TIME) this.y[i] = rest - (1 - this.timer[i] / SINK_TIME) * 14 * this.scale[i];
        if (this.timer[i] <= 0) this.release(i);
      }
    }
  }

  /** Writes every used slot into the GPU buffers and adds blob shadows for live actors. */
  flush(): void {
    const arr = this.mesh.instanceMatrix.array as Float32Array;
    const data = this.data.array as Float32Array;
    const c = this.style.center;
    let n = 0;
    for (let i = 0; i < this.cap; i++) {
      const st = this.state[i];
      if (st === State.Free) continue;
      const s = this.scale[i];
      const o = n * 16;
      // Bodies store the middle of the body as their position; everything else stands on its feet.
      const centered = st === State.Flying || st === State.Down;
      if (this.pitch[i] === 0 && this.roll[i] === 0) {
        // Upright: yaw only, written directly.
        const cs = Math.cos(this.yaw[i]) * s;
        const sn = Math.sin(this.yaw[i]) * s;
        arr[o] = cs;
        arr[o + 1] = 0;
        arr[o + 2] = -sn;
        arr[o + 3] = 0;
        arr[o + 4] = 0;
        arr[o + 5] = s;
        arr[o + 6] = 0;
        arr[o + 7] = 0;
        arr[o + 8] = sn;
        arr[o + 9] = 0;
        arr[o + 10] = cs;
        arr[o + 11] = 0;
        arr[o + 12] = this.x[i];
        arr[o + 13] = centered ? this.y[i] - c * s : this.y[i];
        arr[o + 14] = this.z[i];
        arr[o + 15] = 1;
      } else {
        this.q.setFromEuler(this.e.set(this.pitch[i], this.yaw[i], this.roll[i]));
        this.m.compose(this.p.set(this.x[i], this.y[i], this.z[i]), this.q, this.s.set(s, s, s));
        this.m.toArray(arr, o);
        if (centered) {
          arr[o + 12] -= arr[o + 4] * c;
          arr[o + 13] -= arr[o + 5] * c;
          arr[o + 14] -= arr[o + 6] * c;
        }
      }
      data[n * 4] = this.cycle[i];
      data[n * 4 + 1] = this.swing[i];
      data[n * 4 + 2] = this.flash[i];
      data[n * 4 + 3] = this.shade[i];
      if (st === State.Live && this.style.shadow > 0) this.fx.shadow(this.x[i], this.z[i], this.style.shadow * s);
      n++;
    }
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    if (n > 0) {
      this.mesh.instanceMatrix.clearUpdateRanges();
      this.mesh.instanceMatrix.addUpdateRange(0, n * 16);
      this.mesh.instanceMatrix.needsUpdate = true;
      this.data.clearUpdateRanges();
      this.data.addUpdateRange(0, n * 4);
      this.data.needsUpdate = true;
    }
  }
}
