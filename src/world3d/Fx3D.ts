import * as THREE from 'three';
import { Frame, buildFxTexture } from './fxAtlas';
import { debrisModel } from './models';

const VERT = /* glsl */ `
attribute vec3 iPos;
attribute vec3 iDir;
attribute vec2 iSize;
attribute vec4 iColor;
attribute float iFrame;
uniform float uFogNear;
uniform float uFogFar;
varying vec2 vUv;
varying vec4 vColor;
varying float vFog;
void main() {
  vec2 corner = position.xy;
  float frame = iFrame;
  vec4 mv;
  if (frame >= 16.0) {
    // Lying flat on the ground (decals, shadows, shockwaves).
    frame -= 16.0;
    float c = cos(iSize.y);
    float s = sin(iSize.y);
    vec2 r = vec2(corner.x * c - corner.y * s, corner.x * s + corner.y * c) * iSize.x;
    mv = modelViewMatrix * vec4(iPos.x + r.x, iPos.y, iPos.z + r.y, 1.0);
  } else {
    mv = modelViewMatrix * vec4(iPos, 1.0);
    if (dot(iDir, iDir) > 0.0) {
      // Streak from iPos (head) back along iDir (tail), facing the camera.
      vec4 tail = modelViewMatrix * vec4(iPos + iDir, 1.0);
      vec2 axis = tail.xy - mv.xy;
      float len = length(axis);
      vec2 ax = len > 0.001 ? axis / len : vec2(0.0, 1.0);
      mv.xyz = mix(mv.xyz, tail.xyz, corner.y + 0.5);
      mv.xy += vec2(-ax.y, ax.x) * corner.x * iSize.x;
    } else {
      float c = cos(iSize.y);
      float s = sin(iSize.y);
      mv.xy += vec2(corner.x * c - corner.y * s, corner.x * s + corner.y * c) * iSize.x;
    }
  }
  gl_Position = projectionMatrix * mv;
  float col = mod(frame, 4.0);
  float row = floor(frame / 4.0);
  vUv = vec2((col + uv.x) / 4.0, 1.0 - (row + 1.0 - uv.y) / 4.0);
  vColor = iColor;
  vFog = smoothstep(uFogNear, uFogFar, -mv.z);
}`;

const FRAG_ADD = /* glsl */ `
uniform sampler2D map;
varying vec2 vUv;
varying vec4 vColor;
varying float vFog;
void main() {
  vec4 t = texture2D(map, vUv);
  gl_FragColor = vec4(t.rgb * vColor.rgb * (1.0 - vFog), t.a * vColor.a);
}`;

const FRAG_ALPHA = /* glsl */ `
uniform sampler2D map;
uniform vec3 uFogColor;
varying vec2 vUv;
varying vec4 vColor;
varying float vFog;
void main() {
  vec4 t = texture2D(map, vUv);
  gl_FragColor = vec4(mix(t.rgb * vColor.rgb, uFogColor, vFog), t.a * vColor.a);
}`;

/** One draw call worth of textured quads, rewritten from scratch every frame. */
class QuadBatch {
  readonly mesh: THREE.Mesh;
  private readonly geometry = new THREE.InstancedBufferGeometry();
  private readonly pos: THREE.InstancedBufferAttribute;
  private readonly dir: THREE.InstancedBufferAttribute;
  private readonly size: THREE.InstancedBufferAttribute;
  private readonly color: THREE.InstancedBufferAttribute;
  private readonly frame: THREE.InstancedBufferAttribute;
  readonly material: THREE.ShaderMaterial;
  count = 0;

  constructor(readonly capacity: number, texture: THREE.Texture, additive: boolean, fog: THREE.Fog) {
    const base = new THREE.PlaneGeometry(1, 1);
    this.geometry.index = base.index;
    this.geometry.setAttribute('position', base.getAttribute('position'));
    this.geometry.setAttribute('uv', base.getAttribute('uv'));
    const attr = (size: number) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(capacity * size), size);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    this.pos = attr(3);
    this.dir = attr(3);
    this.size = attr(2);
    this.color = attr(4);
    this.frame = attr(1);
    this.geometry.setAttribute('iPos', this.pos);
    this.geometry.setAttribute('iDir', this.dir);
    this.geometry.setAttribute('iSize', this.size);
    this.geometry.setAttribute('iColor', this.color);
    this.geometry.setAttribute('iFrame', this.frame);
    this.geometry.instanceCount = 0;
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: additive ? FRAG_ADD : FRAG_ALPHA,
      uniforms: {
        map: { value: texture },
        uFogColor: { value: fog.color },
        uFogNear: { value: fog.near },
        uFogFar: { value: fog.far },
      },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 3 : 2;
  }

  begin(): void {
    this.count = 0;
  }

  push(x: number, y: number, z: number, dx: number, dy: number, dz: number, size: number, rot: number, r: number, g: number, b: number, a: number, frame: number): void {
    if (this.count >= this.capacity) return;
    const i = this.count++;
    const p = this.pos.array as Float32Array;
    p[i * 3] = x;
    p[i * 3 + 1] = y;
    p[i * 3 + 2] = z;
    const d = this.dir.array as Float32Array;
    d[i * 3] = dx;
    d[i * 3 + 1] = dy;
    d[i * 3 + 2] = dz;
    const s = this.size.array as Float32Array;
    s[i * 2] = size;
    s[i * 2 + 1] = rot;
    const c = this.color.array as Float32Array;
    c[i * 4] = r;
    c[i * 4 + 1] = g;
    c[i * 4 + 2] = b;
    c[i * 4 + 3] = a;
    (this.frame.array as Float32Array)[i] = frame;
  }

  end(): void {
    const n = this.count;
    this.geometry.instanceCount = n;
    this.mesh.visible = n > 0;
    if (n === 0) return;
    for (const a of [this.pos, this.dir, this.size, this.color, this.frame]) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, n * a.itemSize);
      a.needsUpdate = true;
    }
  }
}

/** Flag on Particle.flags: drawn flat on the ground instead of facing the camera. */
const FLAT = 1;
/** Streak: a stretched quad trailing behind its velocity (tracers, sparks). */
const STREAK = 2;

/** Short-lived quads with simple motion: one pool per blend mode. */
class Particles {
  private readonly n: number;
  readonly px: Float32Array;
  readonly py: Float32Array;
  readonly pz: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly vz: Float32Array;
  readonly grav: Float32Array;
  readonly drag: Float32Array;
  readonly life: Float32Array;
  readonly max: Float32Array;
  readonly s0: Float32Array;
  readonly s1: Float32Array;
  readonly rot: Float32Array;
  readonly vrot: Float32Array;
  readonly r: Float32Array;
  readonly g: Float32Array;
  readonly b: Float32Array;
  readonly a0: Float32Array;
  readonly a1: Float32Array;
  readonly frame: Uint8Array;
  readonly flags: Uint8Array;
  /** Streak tail length in seconds of travel. */
  readonly tail: Float32Array;
  private cursor = 0;
  active = 0;

  constructor(capacity: number) {
    this.n = capacity;
    const f = () => new Float32Array(capacity);
    this.px = f();
    this.py = f();
    this.pz = f();
    this.vx = f();
    this.vy = f();
    this.vz = f();
    this.grav = f();
    this.drag = f();
    this.life = f();
    this.max = f();
    this.s0 = f();
    this.s1 = f();
    this.rot = f();
    this.vrot = f();
    this.r = f();
    this.g = f();
    this.b = f();
    this.a0 = f();
    this.a1 = f();
    this.tail = f();
    this.frame = new Uint8Array(capacity);
    this.flags = new Uint8Array(capacity);
  }

  /** Next slot; when all are busy the oldest one is reused (invisible in a busy fight). */
  spawn(x: number, y: number, z: number, life: number, size: number, hex: number, frame: Frame): number {
    let i = this.cursor;
    for (let k = 0; k < this.n; k++) {
      const j = (this.cursor + k) % this.n;
      if (this.life[j] <= 0) {
        i = j;
        break;
      }
    }
    this.cursor = (i + 1) % this.n;
    this.px[i] = x;
    this.py[i] = y;
    this.pz[i] = z;
    this.vx[i] = 0;
    this.vy[i] = 0;
    this.vz[i] = 0;
    this.grav[i] = 0;
    this.drag[i] = 0;
    this.life[i] = life;
    this.max[i] = life;
    this.s0[i] = size;
    this.s1[i] = size;
    this.rot[i] = Math.random() * Math.PI * 2;
    this.vrot[i] = 0;
    this.r[i] = ((hex >> 16) & 255) / 255;
    this.g[i] = ((hex >> 8) & 255) / 255;
    this.b[i] = (hex & 255) / 255;
    this.a0[i] = 1;
    this.a1[i] = 0;
    this.frame[i] = frame;
    this.flags[i] = 0;
    this.tail[i] = 0;
    return i;
  }

  update(dt: number, batch: QuadBatch): void {
    let active = 0;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) continue;
      active++;
      if (this.drag[i] > 0) {
        const k = Math.max(0, 1 - this.drag[i] * dt);
        this.vx[i] *= k;
        this.vy[i] *= k;
        this.vz[i] *= k;
      }
      this.vy[i] -= this.grav[i] * dt;
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;
      if (this.grav[i] > 0 && this.py[i] < 1) {
        // Drops and sparks stop on the road.
        this.py[i] = 1;
        this.vx[i] *= 0.4;
        this.vz[i] *= 0.4;
        this.vy[i] = 0;
      }
      this.rot[i] += this.vrot[i] * dt;
      const t = 1 - this.life[i] / this.max[i];
      const size = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      const alpha = this.a0[i] + (this.a1[i] - this.a0[i]) * t;
      const flags = this.flags[i];
      let dx = 0;
      let dy = 0;
      let dz = 0;
      if (flags & STREAK) {
        const age = this.max[i] - this.life[i];
        const k = -Math.min(this.tail[i], age);
        dx = this.vx[i] * k;
        dy = this.vy[i] * k;
        dz = this.vz[i] * k;
      }
      batch.push(
        this.px[i], this.py[i], this.pz[i], dx, dy, dz, size, this.rot[i],
        this.r[i], this.g[i], this.b[i], alpha, this.frame[i] + (flags & FLAT ? 16 : 0),
      );
    }
    this.active = active;
  }

  clear(): void {
    this.life.fill(0);
    this.active = 0;
  }
}

/** Persistent marks on the road (blood, scorch, cracks), fading out after a few seconds. */
class Decals {
  private readonly x: Float32Array;
  private readonly y: Float32Array;
  private readonly z: Float32Array;
  private readonly size: Float32Array;
  private readonly grow: Float32Array;
  private readonly rot: Float32Array;
  private readonly hex: Uint32Array;
  private readonly alpha: Float32Array;
  private readonly life: Float32Array;
  private readonly frame: Uint8Array;
  private cursor = 0;

  constructor(private readonly n: number) {
    this.x = new Float32Array(n);
    this.y = new Float32Array(n);
    this.z = new Float32Array(n);
    this.size = new Float32Array(n);
    this.grow = new Float32Array(n);
    this.rot = new Float32Array(n);
    this.hex = new Uint32Array(n);
    this.alpha = new Float32Array(n);
    this.life = new Float32Array(n);
    this.frame = new Uint8Array(n);
  }

  add(x: number, z: number, size: number, hex: number, frame: Frame, alpha: number, life: number): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.n;
    this.x[i] = x;
    // Later marks sit a hair higher so overlapping ones never flicker.
    this.y[i] = 0.6 + (i % 8) * 0.08;
    this.z[i] = z;
    this.size[i] = size * 0.6;
    this.grow[i] = size;
    this.rot[i] = Math.random() * Math.PI * 2;
    this.hex[i] = hex;
    this.alpha[i] = alpha;
    this.life[i] = life;
    this.frame[i] = frame;
  }

  update(dt: number, batch: QuadBatch, behindZ: number): void {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0 || this.z[i] > behindZ) {
        this.life[i] = 0;
        continue;
      }
      // Splats spread out quickly to full size.
      if (this.size[i] < this.grow[i]) this.size[i] = Math.min(this.grow[i], this.size[i] + this.grow[i] * dt * 6);
      const hex = this.hex[i];
      const a = this.alpha[i] * Math.min(1, this.life[i]);
      batch.push(this.x[i], this.y[i], this.z[i], 0, 0, 0, this.size[i], this.rot[i], ((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255, a, this.frame[i] + 16);
    }
  }

  clear(): void {
    this.life.fill(0);
  }
}

/** Tumbling chunks (gore, planks, sandbags, glass, brass) that bounce on the road and sink away. */
class Debris {
  readonly mesh: THREE.InstancedMesh;
  private readonly n: number;
  private readonly p: Float32Array;
  private readonly v: Float32Array;
  private readonly r: Float32Array;
  private readonly w: Float32Array;
  private readonly s: Float32Array;
  private readonly life: Float32Array;
  private readonly colors: Float32Array;
  private cursor = 0;
  active = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly pos = new THREE.Vector3();
  private readonly scl = new THREE.Vector3();

  constructor(capacity: number) {
    this.n = capacity;
    this.p = new Float32Array(capacity * 3);
    this.v = new Float32Array(capacity * 3);
    this.r = new Float32Array(capacity * 3);
    this.w = new Float32Array(capacity * 3);
    this.s = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.colors = new Float32Array(capacity * 3);
    this.mesh = new THREE.InstancedMesh(debrisModel(), new THREE.MeshBasicMaterial({ vertexColors: true }), capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
  }

  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, sx: number, sy: number, sz: number, hex: number, life: number): void {
    let i = this.cursor;
    for (let k = 0; k < this.n; k++) {
      const j = (this.cursor + k) % this.n;
      if (this.life[j] <= 0) {
        i = j;
        break;
      }
    }
    this.cursor = (i + 1) % this.n;
    const i3 = i * 3;
    this.p[i3] = x;
    this.p[i3 + 1] = y;
    this.p[i3 + 2] = z;
    this.v[i3] = vx;
    this.v[i3 + 1] = vy;
    this.v[i3 + 2] = vz;
    this.r[i3] = Math.random() * 6;
    this.r[i3 + 1] = Math.random() * 6;
    this.r[i3 + 2] = Math.random() * 6;
    this.w[i3] = (Math.random() - 0.5) * 22;
    this.w[i3 + 1] = (Math.random() - 0.5) * 14;
    this.w[i3 + 2] = (Math.random() - 0.5) * 22;
    this.s[i3] = sx;
    this.s[i3 + 1] = sy;
    this.s[i3 + 2] = sz;
    this.life[i] = life;
    this.colors[i3] = ((hex >> 16) & 255) / 255;
    this.colors[i3 + 1] = ((hex >> 8) & 255) / 255;
    this.colors[i3 + 2] = (hex & 255) / 255;
  }

  update(dt: number): void {
    const arr = this.mesh.instanceMatrix.array as Float32Array;
    const col = this.mesh.instanceColor!.array as Float32Array;
    let n = 0;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) continue;
      const i3 = i * 3;
      const half = Math.min(this.s[i3], this.s[i3 + 1], this.s[i3 + 2]) * 0.5;
      this.v[i3 + 1] -= 1500 * dt;
      this.p[i3] += this.v[i3] * dt;
      this.p[i3 + 1] += this.v[i3 + 1] * dt;
      this.p[i3 + 2] += this.v[i3 + 2] * dt;
      if (this.p[i3 + 1] < half) {
        this.p[i3 + 1] = half;
        if (this.v[i3 + 1] < -90) {
          this.v[i3 + 1] *= -0.35;
          this.v[i3] *= 0.6;
          this.v[i3 + 2] *= 0.6;
          this.w[i3] *= 0.5;
          this.w[i3 + 2] *= 0.5;
        } else {
          this.v[i3 + 1] = 0;
          this.v[i3] *= 0.8;
          this.v[i3 + 2] *= 0.8;
          this.w[i3] *= 0.8;
          this.w[i3 + 1] *= 0.8;
          this.w[i3 + 2] *= 0.8;
          // Lying still: settle flat.
          this.r[i3] += (Math.round(this.r[i3] / (Math.PI / 2)) * (Math.PI / 2) - this.r[i3]) * Math.min(1, dt * 8);
          this.r[i3 + 2] += (Math.round(this.r[i3 + 2] / (Math.PI / 2)) * (Math.PI / 2) - this.r[i3 + 2]) * Math.min(1, dt * 8);
        }
      }
      this.r[i3] += this.w[i3] * dt;
      this.r[i3 + 1] += this.w[i3 + 1] * dt;
      this.r[i3 + 2] += this.w[i3 + 2] * dt;
      // Shrinks away at the end of its life.
      const fade = Math.min(1, this.life[i] / 0.4);
      this.q.setFromEuler(this.e.set(this.r[i3], this.r[i3 + 1], this.r[i3 + 2]));
      this.pos.set(this.p[i3], this.p[i3 + 1], this.p[i3 + 2]);
      this.scl.set(this.s[i3] * fade, this.s[i3 + 1] * fade, this.s[i3 + 2] * fade);
      this.m.compose(this.pos, this.q, this.scl);
      this.m.toArray(arr, n * 16);
      col[n * 3] = this.colors[i3];
      col[n * 3 + 1] = this.colors[i3 + 1];
      col[n * 3 + 2] = this.colors[i3 + 2];
      n++;
    }
    this.active = n;
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    if (n > 0) {
      this.mesh.instanceMatrix.clearUpdateRanges();
      this.mesh.instanceMatrix.addUpdateRange(0, n * 16);
      this.mesh.instanceMatrix.needsUpdate = true;
      this.mesh.instanceColor!.clearUpdateRanges();
      this.mesh.instanceColor!.addUpdateRange(0, n * 3);
      this.mesh.instanceColor!.needsUpdate = true;
    }
  }

  clear(): void {
    this.life.fill(0);
    this.update(0);
  }
}

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

/**
 * Battle effects in 3D, three draw calls in all: additive quads (fire, sparks, tracers, flashes),
 * alpha quads (shadows, road marks, smoke, blood mist) and debris cubes. Everything is preallocated
 * and recycled; nothing is created while a battle runs. Coordinates are world units (x = road x,
 * z = minus distance along the road).
 */
export class Fx3D {
  private readonly add: QuadBatch;
  private readonly alpha: QuadBatch;
  private readonly hot: Particles;
  private readonly soft: Particles;
  private readonly marks: Decals;
  readonly debris: Debris;
  /** Multiplies how many particles bursts spawn (low-spec mode halves it). */
  density = 1;

  constructor(scene: THREE.Scene, fog: THREE.Fog) {
    const texture = buildFxTexture();
    this.add = new QuadBatch(420, texture, true, fog);
    this.alpha = new QuadBatch(720, texture, false, fog);
    this.hot = new Particles(400);
    this.soft = new Particles(300);
    this.marks = new Decals(110);
    this.debris = new Debris(260);
    scene.add(this.alpha.mesh, this.add.mesh, this.debris.mesh);
  }

  /** Effects alive now (debug overlay). */
  get activeCount(): number {
    return this.hot.active + this.soft.active + this.debris.active;
  }

  private n(count: number): number {
    return Math.max(1, Math.round(count * this.density));
  }

  /** Starts a frame: actors add their ground shadows between begin() and end(). */
  begin(): void {
    this.alpha.begin();
    this.add.begin();
  }

  shadow(x: number, z: number, size: number, alpha = 0.5): void {
    this.alpha.push(x, 0.35, z, 0, 0, 0, size, 0, 0.04, 0.03, 0.05, alpha, Frame.Shadow + 16);
  }

  end(dt: number, cameraZ: number): void {
    this.marks.update(dt, this.alpha, cameraZ);
    this.soft.update(dt, this.alpha);
    this.hot.update(dt, this.add);
    this.debris.update(dt);
    this.alpha.end();
    this.add.end();
  }

  clear(): void {
    this.hot.clear();
    this.soft.clear();
    this.marks.clear();
    this.debris.clear();
    this.begin();
    this.alpha.end();
    this.add.end();
  }

  // ---------- building blocks ----------

  glow(x: number, y: number, z: number, size: number, hex: number, life = 0.12, alpha = 0.9): void {
    const i = this.hot.spawn(x, y, z, life, size, hex, Frame.Glow);
    this.hot.s1[i] = size * 1.35;
    this.hot.a0[i] = alpha;
  }

  /** Muzzle flash: a star that is gone in a few frames. */
  flash(x: number, y: number, z: number, size: number, hex = 0xffe08a): void {
    const i = this.hot.spawn(x, y, z, 0.05, size, hex, Frame.Flash);
    this.hot.s1[i] = size * 0.6;
    this.hot.a0[i] = 1;
    this.hot.a1[i] = 0.3;
  }

  /** A bullet streak flying from one point to another. */
  tracer(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, hex: number, width: number, speed = 6500): void {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dz = z1 - z0;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < 1) return;
    const life = dist / speed;
    const i = this.hot.spawn(x0, y0, z0, life, width, hex, Frame.Streak);
    this.hot.vx[i] = (dx / dist) * speed;
    this.hot.vy[i] = (dy / dist) * speed;
    this.hot.vz[i] = (dz / dist) * speed;
    this.hot.flags[i] = STREAK;
    this.hot.tail[i] = Math.min(0.05, 240 / speed);
    this.hot.a1[i] = 0.9;
  }

  sparks(x: number, y: number, z: number, count: number, hex: number, speed: number, life = 0.35): void {
    const n = this.n(count);
    for (let k = 0; k < n; k++) {
      const i = this.hot.spawn(x, y, z, life * rand(0.6, 1.1), rand(3, 6), hex, Frame.Glow);
      const a = Math.random() * Math.PI * 2;
      const up = rand(0.1, 1);
      const v = speed * rand(0.4, 1);
      this.hot.vx[i] = Math.cos(a) * v;
      this.hot.vz[i] = Math.sin(a) * v;
      this.hot.vy[i] = up * v;
      this.hot.grav[i] = 1200;
      this.hot.flags[i] = STREAK;
      this.hot.tail[i] = 0.02;
      this.hot.a1[i] = 0;
    }
  }

  smoke(x: number, y: number, z: number, size: number, hex: number, life = 1, alpha = 0.55, rise = 50): void {
    const i = this.soft.spawn(x, y, z, life * rand(0.8, 1.2), size * 0.6, hex, Frame.Smoke);
    this.soft.s1[i] = size * rand(1.2, 1.6);
    this.soft.a0[i] = alpha;
    this.soft.vy[i] = rise;
    this.soft.vx[i] = rand(-15, 15);
    this.soft.vrot[i] = rand(-1, 1);
  }

  dust(x: number, z: number, size: number, hex = 0x8a7a68, alpha = 0.5): void {
    const i = this.soft.spawn(x, size * 0.25, z, rand(0.6, 0.9), size * 0.5, hex, Frame.Dust);
    this.soft.s1[i] = size * 1.4;
    this.soft.a0[i] = alpha;
    this.soft.vy[i] = 20;
    this.soft.vrot[i] = rand(-0.6, 0.6);
  }

  decal(x: number, z: number, size: number, hex: number, frame: Frame = Frame.Splat, alpha = 0.85, life = 6): void {
    this.marks.add(x, z, size, hex, frame, alpha, life);
  }

  /** Bright ring racing out along the ground. */
  shock(x: number, z: number, size: number, hex: number, life = 0.35): void {
    const i = this.hot.spawn(x, 2, z, life, size * 0.15, hex, Frame.Shock);
    this.hot.s1[i] = size;
    this.hot.flags[i] = FLAT;
    this.hot.a0[i] = 1;
  }

  chunks(x: number, y: number, z: number, count: number, hex: number, speed: number, size: number, dirX = 0, dirZ = 0, life = 1.6): void {
    const n = this.n(count);
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * rand(0.35, 1);
      const s = size * rand(0.6, 1.3);
      this.debris.spawn(
        x, y, z,
        Math.cos(a) * v * 0.6 + dirX * speed * 0.7, rand(0.5, 1.2) * speed, Math.sin(a) * v * 0.6 + dirZ * speed * 0.7,
        s, s * rand(0.6, 1), s * rand(0.7, 1.2), hex, life * rand(0.7, 1.2),
      );
    }
  }

  // ---------- composed effects ----------

  /** A bullet hitting flesh: spark, puff of blood, a drop or two. */
  hit(x: number, y: number, z: number, blood: number, heavy: boolean): void {
    const i = this.soft.spawn(x, y, z, 0.28, heavy ? 22 : 14, blood, Frame.Splat);
    this.soft.s1[i] = heavy ? 46 : 30;
    this.soft.a0[i] = 0.85;
    this.soft.vy[i] = 30;
    if (Math.random() < 0.6) this.glow(x, y, z, heavy ? 40 : 22, 0xfff0c0, 0.06);
  }

  /** Blood spray and a splat on the road where something died. */
  gore(x: number, y: number, z: number, blood: number, scale: number, dirX: number, dirZ: number): void {
    for (let k = 0; k < this.n(2); k++) {
      const i = this.soft.spawn(x + rand(-6, 6) * scale, y + rand(-4, 8) * scale, z, rand(0.3, 0.45), 20 * scale, blood, Frame.Splat);
      this.soft.s1[i] = rand(48, 70) * scale;
      this.soft.a0[i] = 0.9;
      this.soft.vx[i] = dirX * 120;
      this.soft.vz[i] = dirZ * 120;
      this.soft.vy[i] = 40;
    }
    for (let k = 0; k < this.n(4); k++) {
      const i = this.soft.spawn(x, y, z, rand(0.5, 0.8), rand(5, 8) * scale, blood, Frame.Drop);
      const a = Math.random() * Math.PI * 2;
      const v = rand(120, 320);
      this.soft.vx[i] = Math.cos(a) * v * 0.6 + dirX * v;
      this.soft.vz[i] = Math.sin(a) * v * 0.6 + dirZ * v;
      this.soft.vy[i] = rand(150, 380);
      this.soft.grav[i] = 1400;
      this.soft.a1[i] = 0.8;
    }
    this.chunks(x, y, z, 2, blood, 260 * Math.sqrt(scale), 4.5 * scale, dirX, dirZ, 1.2);
    this.decal(x + dirX * 25, z + dirZ * 25, rand(55, 80) * scale, blood, Frame.Splat, 0.8);
  }

  /** Fireball, sparks, smoke, debris, a shockwave and a scorch mark. */
  explosion(x: number, y: number, z: number, scale: number): void {
    this.glow(x, y + 20 * scale, z, 260 * scale, 0xffd27a, 0.22, 1);
    this.glow(x, y + 10 * scale, z, 150 * scale, 0xffffff, 0.08, 1);
    for (let k = 0; k < this.n(7); k++) {
      const i = this.hot.spawn(x + rand(-30, 30) * scale, y + rand(5, 40) * scale, z + rand(-30, 30) * scale, rand(0.25, 0.45), rand(50, 90) * scale, k % 2 === 0 ? 0xff9a30 : 0xffc040, Frame.Flame);
      this.hot.s1[i] = this.hot.s0[i] * 1.8;
      this.hot.vy[i] = rand(60, 160) * scale;
      this.hot.vx[i] = rand(-90, 90) * scale;
      this.hot.vz[i] = rand(-90, 90) * scale;
      this.hot.drag[i] = 3;
      this.hot.vrot[i] = rand(-3, 3);
    }
    this.sparks(x, y + 10, z, 10, 0xffd080, 520 * scale, 0.5);
    for (let k = 0; k < this.n(4); k++) this.smoke(x + rand(-40, 40) * scale, y + rand(20, 60) * scale, z + rand(-30, 30) * scale, 110 * scale, 0x2a2420, 1.4, 0.6, 70);
    this.shock(x, z, 340 * scale, 0xffb050, 0.32);
    this.chunks(x, y + 10, z, 6, 0x3a3230, 420 * scale, 6 * scale, 0, 0, 1.6);
    this.decal(x, z, 150 * scale, 0x1a1410, Frame.Scorch, 0.85, 8);
  }
}
