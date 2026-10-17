import type Phaser from 'phaser';
import * as THREE from 'three';
import { BUILDING_IDS, type BuildingId } from '../meta/shelter';
import { ActorPool } from './ActorPool';
import { UNIT_SCALE } from './Crowd3D';
import { Fx3D } from './Fx3D';
import { soldierModel, survivorModel } from './models';
import { BUILDING_SIZE, buildingModel, yardModel } from './shelterModels';
import { createWorld, type CameraView, type ScreenPoint, type World3D } from './World3D';

/** Where each building stands (its feet), in the same units as the battle road. */
export const SHELTER_SPOTS: Record<BuildingId, { x: number; z: number }> = {
  wall: { x: 360, z: -560 },
  armory: { x: 168, z: -250 },
  garage: { x: 552, z: -250 },
  farm: { x: 168, z: 250 },
  radio: { x: 552, z: 250 },
};
const FIRE = { x: 360, z: 0 };
const LAMPS = [
  { x: 280, z: -470 },
  { x: 440, z: -470 },
  { x: 360, z: 170 },
  { x: 60, z: 20 },
  { x: 660, z: 20 },
];
/** High above the yard, looking down at it from the south fence. */
const SHELTER_VIEW: CameraView = { back: 400, up: 700, ahead: 120, lookY: 0, hFov: 54, followX: 0 };
const FOG = 0x4a3c48;
const SITTERS = 6;
const WALKERS = 5;
const WALK_SPEED = 42;
/** Spots walkers stroll between. */
const WAYPOINTS = [
  [360, -440], [250, -330], [470, -330], [120, -110], [600, -110], [360, -150],
  [270, 40], [450, 40], [120, 140], [600, 140], [360, 330], [250, 330], [470, 330],
];
const POP_TIME = 0.7;

/** A building's tap area on screen and where its label goes, in game units. */
export interface BuildingRect {
  x: number;
  y: number;
  w: number;
  h: number;
  labelX: number;
  labelY: number;
}

/**
 * The shelter yard in 3D, built once: five buildings (three looks each, by level), the fence and
 * the ruined city outside, a campfire with survivors around it, others walking between buildings,
 * guards at the gate. Upgrades make the building jump and kick up dust.
 */
export class ShelterWorld {
  readonly fx: Fx3D;
  private readonly meshes = new Map<BuildingId, THREE.Mesh>();
  private readonly looks = new Map<string, THREE.BufferGeometry>();
  private readonly tiers = new Map<BuildingId, number>();
  private readonly pops = new Map<BuildingId, number>();
  private readonly people: ActorPool;
  private readonly guards: ActorPool;
  private readonly walkTarget = new Int8Array(WALKERS);
  private readonly walkPause = new Float32Array(WALKERS);
  private readonly slots = new Int16Array(SITTERS + WALKERS);
  private time = 0;
  private smokeTimer = 0;
  private readonly corner = new THREE.Vector3();
  private readonly sp: ScreenPoint = { x: 0, y: 0, scale: 1 };

  constructor(readonly world: World3D) {
    const scene = world.scene;
    world.setFogColor(FOG);
    world.fog.near = 1400;
    world.fog.far = 3600;
    this.fx = new Fx3D(scene, world.fog);
    const material = new THREE.MeshBasicMaterial({ vertexColors: true });
    const yard = new THREE.Mesh(yardModel(FIRE, LAMPS), material);
    yard.matrixAutoUpdate = false;
    scene.add(yard);
    for (const id of BUILDING_IDS) {
      for (let t = 0; t < 3; t++) this.looks.set(`${id}${t}`, buildingModel(id, t));
      const mesh = new THREE.Mesh(this.looks.get(`${id}0`), material);
      const spot = SHELTER_SPOTS[id];
      mesh.position.set(spot.x, 0, spot.z);
      this.meshes.set(id, mesh);
      this.tiers.set(id, 0);
      this.pops.set(id, POP_TIME);
      scene.add(mesh);
    }
    this.people = new ActorPool(survivorModel(), SITTERS + WALKERS, { center: 20, blood: 0x9a1020, shadow: 24 }, this.fx);
    this.guards = new ActorPool(soldierModel(), 2, { center: 21, blood: 0x9a1020, shadow: 24 }, this.fx);
    scene.add(this.people.mesh, this.guards.mesh);
  }

  /** Sets every building to its look for the saved levels and puts everyone in place. */
  begin(tiers: Record<BuildingId, number>): void {
    for (const id of BUILDING_IDS) this.setTier(id, tiers[id]);
    for (const id of BUILDING_IDS) this.pops.set(id, POP_TIME);
    this.fx.clear();
    this.world.setView(SHELTER_VIEW);
    this.world.reset(360, 0);
    this.people.reset();
    this.guards.reset();
    for (let i = 0; i < SITTERS; i++) {
      const s = this.people.alloc();
      this.slots[i] = s;
      const a = (i / SITTERS) * Math.PI * 2 + 0.3;
      const p = this.people;
      p.x[s] = FIRE.x + Math.cos(a) * 74;
      p.z[s] = FIRE.z + Math.sin(a) * 58;
      // Facing the fire.
      p.yaw[s] = Math.atan2(p.x[s] - FIRE.x, p.z[s] - FIRE.z);
      p.scale[s] = UNIT_SCALE;
      p.shade[s] = 0.85;
    }
    for (let i = 0; i < WALKERS; i++) {
      const s = this.people.alloc();
      this.slots[SITTERS + i] = s;
      const w = WAYPOINTS[(i * 5) % WAYPOINTS.length];
      this.people.x[s] = w[0];
      this.people.z[s] = w[1];
      this.people.scale[s] = UNIT_SCALE;
      this.people.shade[s] = 0.85;
      this.walkTarget[i] = (i * 5 + 3) % WAYPOINTS.length;
      this.walkPause[i] = i * 0.7;
    }
    for (let i = 0; i < 2; i++) {
      const s = this.guards.alloc();
      this.guards.x[s] = 316 + i * 88;
      this.guards.z[s] = -505;
      this.guards.yaw[s] = 0;
      this.guards.scale[s] = UNIT_SCALE * 1.06;
      this.guards.shade[s] = 0.85;
    }
  }

  private setTier(id: BuildingId, tier: number): void {
    this.tiers.set(id, tier);
    this.meshes.get(id)!.geometry = this.looks.get(`${id}${tier}`)!;
  }

  /** An upgrade: the building jumps (and changes look when it reaches a new tier), dust and a ring fly out. */
  upgrade(id: BuildingId, tier: number): void {
    const spot = SHELTER_SPOTS[id];
    const size = BUILDING_SIZE[id];
    const fx = this.fx;
    const rebuilt = tier !== this.tiers.get(id);
    if (rebuilt) this.setTier(id, tier);
    this.pops.set(id, rebuilt ? -0.15 : 0);
    const r = Math.max(size.w, size.d) * 0.5;
    fx.shock(spot.x, spot.z, r * 2.6 + 160, 0x8fe0a0, 0.5);
    fx.glow(spot.x, size.h * 0.5, spot.z, r * 2 + 120, 0xbfffd0, 0.3, 0.8);
    fx.sparks(spot.x, size.h * 0.6, spot.z, rebuilt ? 22 : 12, 0xffe080, 460, 0.6);
    const puffs = id === 'wall' ? 14 : 8;
    for (let k = 0; k < puffs; k++) {
      const a = (k / puffs) * Math.PI * 2;
      const dx = id === 'wall' ? (k / (puffs - 1) - 0.5) * size.w : Math.cos(a) * r;
      fx.dust(spot.x + dx, spot.z + Math.sin(a) * size.d * 0.5, rebuilt ? 90 : 60, 0x8a7a66, 0.55);
    }
    if (rebuilt) {
      fx.chunks(spot.x, size.h * 0.5, spot.z, 10, 0x8c6a46, 360, 7);
      this.world.shake(0.3);
      this.world.punch(3);
    } else {
      this.world.shake(0.12);
    }
  }

  update(dt: number): void {
    this.time += dt;
    const fx = this.fx;
    fx.begin();
    this.world.follow(dt, 360, 0);
    this.updatePops(dt);
    this.updatePeople(dt);

    // Campfire: tongues of flame, embers, a halo and some smoke.
    const flicker = 0.85 + Math.sin(this.time * 13) * 0.08 + Math.sin(this.time * 7.3) * 0.07;
    for (let k = 0; k < 2; k++) fx.flame(FIRE.x + (Math.random() - 0.5) * 18, 6, FIRE.z + (Math.random() - 0.5) * 14, 26 + Math.random() * 14);
    if (Math.random() < dt * 6) fx.ember(FIRE.x + (Math.random() - 0.5) * 16, 20, FIRE.z);
    fx.halo(FIRE.x, 26, FIRE.z, 210 * flicker, 0xff8a3a, 0.5);
    this.smokeTimer -= dt;
    if (this.smokeTimer <= 0) {
      this.smokeTimer = 0.35;
      fx.smoke(FIRE.x, 46, FIRE.z, 40, 0x3a3434, 2.6, 0.22, 46);
    }
    for (const l of LAMPS) fx.halo(l.x, 90, l.z + 8, 70, 0xffe2a0, 0.45);
    fx.end(dt, this.world.camera.position.z + 200);
  }

  private updatePops(dt: number): void {
    for (const id of BUILDING_IDS) {
      let t = this.pops.get(id)!;
      if (t >= POP_TIME) continue;
      t += dt;
      this.pops.set(id, t);
      const mesh = this.meshes.get(id)!;
      if (t < 0) {
        // A new look rises out of the ground.
        mesh.scale.set(1, 0.05, 1);
        continue;
      }
      const k = Math.min(1, t / POP_TIME);
      // Squash and stretch settling with a bounce.
      const s = Math.sin(k * Math.PI * 3) * (1 - k);
      mesh.scale.set(1 - s * 0.08, 1 + s * 0.22, 1 - s * 0.08);
      if (k >= 1) mesh.scale.set(1, 1, 1);
    }
  }

  private updatePeople(dt: number): void {
    const p = this.people;
    for (let i = 0; i < SITTERS; i++) {
      const s = this.slots[i];
      p.cycle[s] += dt * 1.5;
      p.swing[s] = 0.08;
    }
    for (let i = 0; i < WALKERS; i++) {
      const s = this.slots[SITTERS + i];
      if (this.walkPause[i] > 0) {
        this.walkPause[i] -= dt;
        p.swing[s] = 0.05;
        p.cycle[s] += dt * 1.5;
        continue;
      }
      const w = WAYPOINTS[this.walkTarget[i]];
      const dx = w[0] - p.x[s];
      const dz = w[1] - p.z[s];
      const len = Math.sqrt(dx * dx + dz * dz);
      if (len < 4) {
        this.walkPause[i] = 1 + Math.random() * 3;
        let next = Math.floor(Math.random() * WAYPOINTS.length);
        if (next === this.walkTarget[i]) next = (next + 1) % WAYPOINTS.length;
        this.walkTarget[i] = next;
        continue;
      }
      const step = Math.min(len, WALK_SPEED * dt);
      p.x[s] += (dx / len) * step;
      p.z[s] += (dz / len) * step;
      // Turn smoothly toward where it is going.
      const want = Math.atan2(-dx, -dz);
      let turn = want - p.yaw[s];
      turn = Math.atan2(Math.sin(turn), Math.cos(turn));
      p.yaw[s] += turn * Math.min(1, dt * 8);
      p.cycle[s] += dt * 9;
      p.swing[s] = 0.7;
      p.y[s] = Math.abs(Math.sin(p.cycle[s])) * 1.5;
    }
    const g = this.guards;
    for (let s = 0; s < 2; s++) {
      g.cycle[s] += dt * 1.2;
      g.swing[s] = 0.05;
      g.yaw[s] = Math.sin(this.time * 0.4 + s * 2) * 0.5;
    }
    p.update(dt);
    p.flush();
    g.update(dt);
    g.flush();
  }

  /** Screen area of a building and the spot under its front for its label. */
  rect(id: BuildingId, out: BuildingRect): void {
    const spot = SHELTER_SPOTS[id];
    const size = BUILDING_SIZE[id];
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let k = 0; k < 8; k++) {
      const c = this.corner.set(spot.x + (k & 1 ? 0.5 : -0.5) * size.w, k & 2 ? size.h : 0, spot.z + (k & 4 ? 0.5 : -0.5) * size.d);
      if (!this.world.project(c.x, c.y, c.z, this.sp)) continue;
      x0 = Math.min(x0, this.sp.x);
      x1 = Math.max(x1, this.sp.x);
      y0 = Math.min(y0, this.sp.y);
      y1 = Math.max(y1, this.sp.y);
    }
    out.x = (x0 + x1) / 2;
    out.y = (y0 + y1) / 2;
    out.w = x1 - x0;
    out.h = y1 - y0;
    this.world.project(spot.x, 0, spot.z + size.d * 0.5 + 12, this.sp);
    out.labelX = this.sp.x;
    out.labelY = this.sp.y + 4;
  }

  /** A point on screen for something standing in the yard (x, z). */
  screenAt(x: number, y: number, z: number, out: ScreenPoint): boolean {
    return this.world.project(x, y, z, out);
  }

  get fogColor(): number {
    return FOG;
  }
}

let shelterWorld: ShelterWorld | null = null;

/** The shelter's 3D yard, created on first use; null without WebGL2. */
export function getShelterWorld(game: Phaser.Game): ShelterWorld | null {
  if (!shelterWorld) {
    const world = createWorld(game);
    if (!world) return null;
    shelterWorld = new ShelterWorld(world);
  }
  return shelterWorld;
}
