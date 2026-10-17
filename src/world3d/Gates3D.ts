import * as THREE from 'three';
import { Colors } from '../config';
import { isGoodOp } from '../sim/Army';
import type { SimGate } from '../sim/BattleSim';
import { ROAD_LEFT, ROAD_RIGHT, type ParsedOp } from '../sim/types';
import type { Vec3 } from './Crowd3D';
import type { Fx3D } from './Fx3D';
import { GeoBuilder } from './geo';
import { GATE_BOTTOM as BOTTOM, GATE_HEIGHT as HEIGHT, GATE_LABEL_Y, sideX } from './layout';
import { VIEW_AHEAD } from './Zombies3D';

const MAX_GATES = 3;
const WIDTH = (ROAD_RIGHT - ROAD_LEFT) / 2 - 10;

export function gateColor(op: ParsedOp): number {
  if (op.kind === 'merge' || op.kind === 'split') return Colors.special;
  return isGoodOp(op) ? Colors.good : Colors.bad;
}

function frameModel(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const w = WIDTH;
  b.box(-w / 2, 0, 0, 9, BOTTOM + HEIGHT + 10, 9, 0xd8dce4);
  b.box(w / 2, 0, 0, 9, BOTTOM + HEIGHT + 10, 9, 0xd8dce4);
  b.box(0, BOTTOM + HEIGHT, 0, w + 9, 9, 9, 0xffffff, { glow: true });
  b.box(0, BOTTOM - 5, 0, w, 5, 7, 0xffffff, { glow: true });
  b.box(-w / 2, BOTTOM + HEIGHT + 10, 0, 13, 7, 13, 0xffffff, { glow: true });
  b.box(w / 2, BOTTOM + HEIGHT + 10, 0, 13, 7, 13, 0xffffff, { glow: true });
  b.box(-w / 2, 0, 0, 16, 6, 16, 0x4a4c52);
  b.box(w / 2, 0, 0, 16, 6, 16, 0x4a4c52);
  return b.build(false);
}

interface GateVis {
  gate: SimGate | null;
  /** Seconds since the army went through (-1 before). */
  fade: number;
  color: [number, number];
}

/**
 * Number gates in 3D: a glowing frame and a pane of colored glass per side. The side the army goes
 * through shatters; the other sinks away. Labels are Phaser text placed over the glass (WorldLabels).
 */
export class Gates3D {
  private readonly frames: THREE.InstancedMesh;
  private readonly panes: THREE.InstancedMesh;
  readonly vis: GateVis[] = [];
  private readonly m = new THREE.Matrix4();
  private readonly c = new THREE.Color();
  private time = 0;

  constructor(scene: THREE.Scene, private readonly fx: Fx3D) {
    this.frames = new THREE.InstancedMesh(frameModel(), new THREE.MeshBasicMaterial({ vertexColors: true }), MAX_GATES * 2);
    const pane = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    this.panes = new THREE.InstancedMesh(pane, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.5, depthWrite: false }), MAX_GATES * 2);
    for (const mesh of [this.frames, this.panes]) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.setColorAt(0, this.c.setHex(0xffffff));
      mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    }
    this.panes.renderOrder = 1;
    for (let i = 0; i < MAX_GATES; i++) this.vis.push({ gate: null, fade: -1, color: [0, 0] });
    scene.add(this.frames, this.panes);
  }

  reset(): void {
    for (const v of this.vis) v.gate = null;
    this.frames.count = 0;
    this.panes.count = 0;
  }

  update(dt: number, gates: readonly SimGate[], distance: number): void {
    this.time += dt;
    for (const g of gates) {
      if (g.passed || g.z - distance > VIEW_AHEAD) continue;
      if (this.find(g)) continue;
      this.attach(g);
    }
    let nf = 0;
    let np = 0;
    const pulse = 0.85 + Math.sin(this.time * 6) * 0.15;
    for (const v of this.vis) {
      const g = v.gate;
      if (!g) continue;
      const z = -g.z;
      if (g.passed && v.fade < 0) this.shatter(v);
      if (v.fade >= 0) v.fade += dt;
      if (g.z - distance < -500) {
        v.gate = null;
        continue;
      }
      for (let s = 0; s < 2; s++) {
        const x = sideX(s);
        const chosen = g.passed && g.chosen === s;
        // Frames: sink into the road after the army passes.
        const sink = v.fade > 0.25 ? Math.min(1, (v.fade - 0.25) / 0.5) : 0;
        this.m.makeTranslation(x, -sink * 140, z);
        this.frames.setMatrixAt(nf, this.m);
        this.c.setHex(v.color[s]).multiplyScalar(g.passed ? 1 : pulse);
        this.frames.setColorAt(nf, this.c);
        nf++;
        if (chosen) continue;
        const shrink = v.fade >= 0 ? Math.max(0, 1 - v.fade / 0.3) : 1;
        if (shrink <= 0) continue;
        this.m.makeScale(WIDTH - 8, HEIGHT * shrink, 3).setPosition(x, BOTTOM, z);
        this.panes.setMatrixAt(np, this.m);
        this.panes.setColorAt(np, this.c.setHex(v.color[s]));
        np++;
      }
    }
    this.frames.count = nf;
    this.panes.count = np;
    this.frames.visible = nf > 0;
    this.panes.visible = np > 0;
    this.frames.instanceMatrix.needsUpdate = true;
    this.frames.instanceColor!.needsUpdate = true;
    this.panes.instanceMatrix.needsUpdate = true;
    this.panes.instanceColor!.needsUpdate = true;
  }

  private find(g: SimGate): GateVis | null {
    for (const v of this.vis) if (v.gate === g) return v;
    return null;
  }

  private attach(g: SimGate): void {
    let v: GateVis | null = null;
    for (const c of this.vis) if (!c.gate) v = c;
    if (!v) return;
    v.gate = g;
    v.fade = -1;
    v.color[0] = gateColor(g.left);
    v.color[1] = gateColor(g.right);
  }

  /** The chosen glass bursts into shards in its color. */
  private shatter(v: GateVis): void {
    v.fade = 0;
    const g = v.gate!;
    const s = g.chosen === 1 ? 1 : 0;
    const x = sideX(s);
    const z = -g.z;
    const hex = v.color[s];
    for (let k = 0; k < 16; k++) {
      const px = x + (Math.random() - 0.5) * WIDTH;
      const py = BOTTOM + Math.random() * HEIGHT;
      this.fx.debris.spawn(px, py, z, (Math.random() - 0.5) * 300, 150 + Math.random() * 350, -150 - Math.random() * 350, 6 + Math.random() * 10, 1.2, 4 + Math.random() * 8, hex, 1 + Math.random() * 0.6);
    }
    this.fx.glow(x, GATE_LABEL_Y, z, 340, hex, 0.25, 1);
    this.fx.sparks(x, GATE_LABEL_Y, z, 10, 0xffffff, 520, 0.4);
    this.fx.shock(x, z, 360, hex, 0.4);
  }

  /** Label anchor of gate i's side s, or null if that gate is not drawn. */
  labelPoint(i: number, s: number, out: Vec3): GateVis | null {
    const v = this.vis[i];
    if (!v.gate) return null;
    out.x = sideX(s);
    out.y = GATE_LABEL_Y;
    out.z = -v.gate.z;
    return v;
  }
}
