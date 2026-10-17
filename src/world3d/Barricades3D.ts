import * as THREE from 'three';
import type { SimBarricade } from '../sim/BattleSim';
import type { Vec3 } from './Crowd3D';
import type { Fx3D } from './Fx3D';
import { plankModel, sandbagModel } from './models';
import { VIEW_AHEAD } from './Zombies3D';

const MAX_BARRICADES = 4;
const MAX_SEGMENTS = 10;
const SEGMENT_W = 62;

interface BarricadeVis {
  b: SimBarricade | null;
  used: number;
  step: number;
  sandbags: boolean;
  lastHp: number;
  chip: number;
}

/**
 * Barricades: a row of sandbags or plank fences across their lane. Chips fly while the army chews
 * through them; when one breaks, its pieces are thrown across the road in a cloud of dust.
 */
export class Barricades3D {
  private readonly bags: THREE.InstancedMesh;
  private readonly planks: THREE.InstancedMesh;
  readonly vis: BarricadeVis[] = [];
  private readonly m = new THREE.Matrix4();

  constructor(scene: THREE.Scene, private readonly fx: Fx3D) {
    const material = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.bags = new THREE.InstancedMesh(sandbagModel(), material, MAX_BARRICADES * MAX_SEGMENTS);
    this.planks = new THREE.InstancedMesh(plankModel(), material, MAX_BARRICADES * MAX_SEGMENTS);
    for (const mesh of [this.bags, this.planks]) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      scene.add(mesh);
    }
    for (let i = 0; i < MAX_BARRICADES; i++) this.vis.push({ b: null, used: 0, step: SEGMENT_W, sandbags: true, lastHp: 0, chip: 0 });
  }

  reset(): void {
    for (const v of this.vis) v.b = null;
    this.bags.count = 0;
    this.planks.count = 0;
  }

  update(dt: number, barricades: readonly SimBarricade[], distance: number): void {
    for (const b of barricades) {
      if (!b.active || b.z - distance > VIEW_AHEAD) continue;
      if (this.find(b)) continue;
      this.attach(b);
    }
    let nb = 0;
    let np = 0;
    for (const v of this.vis) {
      const b = v.b;
      if (!b) continue;
      const z = -b.z;
      if (!b.active) {
        this.burst(v);
        v.b = null;
        continue;
      }
      if (b.z - distance < -400) {
        v.b = null;
        continue;
      }
      // Being chewed through: chips and dust now and then.
      if (b.hp < v.lastHp) {
        v.chip -= dt;
        if (v.chip <= 0) {
          v.chip = 0.12;
          const x = b.x0 + Math.random() * (b.x1 - b.x0);
          this.fx.chunks(x, 20, z + 8, 1, v.sandbags ? 0xb09a68 : 0x9a7a48, 220, 4, 0, 1, 0.9);
          if (Math.random() < 0.4) this.fx.dust(x, z + 10, 50, 0x8a7a68, 0.4);
        }
      }
      v.lastHp = b.hp;
      const shake = b.engaged ? 3 : 0;
      for (let s = 0; s < v.used; s++) {
        const x = b.x0 + v.step * (s + 0.5) + (Math.random() - 0.5) * shake;
        this.m.makeTranslation(x, 0, z + (Math.random() - 0.5) * shake);
        if (v.sandbags) this.bags.setMatrixAt(nb++, this.m);
        else this.planks.setMatrixAt(np++, this.m);
      }
    }
    this.bags.count = nb;
    this.planks.count = np;
    this.bags.visible = nb > 0;
    this.planks.visible = np > 0;
    this.bags.instanceMatrix.needsUpdate = true;
    this.planks.instanceMatrix.needsUpdate = true;
  }

  private find(b: SimBarricade): BarricadeVis | null {
    for (const v of this.vis) if (v.b === b) return v;
    return null;
  }

  private attach(b: SimBarricade): void {
    let v: BarricadeVis | null = null;
    for (const c of this.vis) if (!c.b) v = c;
    if (!v) return;
    v.b = b;
    v.used = Math.min(MAX_SEGMENTS, Math.max(1, Math.round((b.x1 - b.x0) / SEGMENT_W)));
    v.step = (b.x1 - b.x0) / v.used;
    v.sandbags = b.id % 2 === 0;
    v.lastHp = b.hp;
    v.chip = 0;
  }

  /** Broken: every segment flies apart. */
  private burst(v: BarricadeVis): void {
    const b = v.b!;
    const z = -b.z;
    for (let s = 0; s < v.used; s++) {
      const x = b.x0 + v.step * (s + 0.5);
      if (v.sandbags) {
        for (let k = 0; k < 3; k++) {
          this.fx.debris.spawn(x + (Math.random() - 0.5) * 40, 12 + k * 8, z, (Math.random() - 0.5) * 420, 300 + Math.random() * 400, -250 - Math.random() * 400, 16, 8, 12, 0xa08a5a, 1.6);
        }
      } else {
        for (let k = 0; k < 2; k++) {
          this.fx.debris.spawn(x, 10 + k * 9, z, (Math.random() - 0.5) * 380, 320 + Math.random() * 420, -250 - Math.random() * 450, 46, 6, 3, 0x8a6a3a, 1.6);
        }
        this.fx.chunks(x, 20, z, 2, 0x6a4a28, 380, 3, 0, -1, 1.2);
      }
      if (s % 2 === 0) this.fx.dust(x, z, 120, 0x9a8a72, 0.55);
    }
    const cx = (b.x0 + b.x1) / 2;
    this.fx.glow(cx, 30, z, 260, 0xffe0a0, 0.18);
    this.fx.sparks(cx, 25, z, 8, 0xffd080, 450, 0.4);
    this.fx.shock(cx, z, 420, 0xffd8a0, 0.35);
  }

  /** Label anchor of barricade i: above its middle. */
  labelPoint(i: number, out: Vec3): SimBarricade | null {
    const b = this.vis[i].b;
    if (!b || !b.active) return null;
    out.x = (b.x0 + b.x1) / 2;
    out.y = 62;
    out.z = -b.z;
    return b;
  }
}
