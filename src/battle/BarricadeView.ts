import Phaser from 'phaser';
import { ATLAS, formatCount, NUM_FONT } from '../art/atlas';
import type { SimBarricade } from '../sim/BattleSim';
import { Depth } from './depth';
import type { Effects } from './Effects';

const MAX_BARRICADES = 4;
const MAX_SEGMENTS = 10;
const SEGMENT_W = 62;

interface BarricadeVis {
  b: SimBarricade | null;
  segments: Phaser.GameObjects.Image[];
  used: number;
  step: number;
  label: Phaser.GameObjects.BitmapText;
  labelValue: number;
  /** Seconds since it was destroyed; segments fly apart during this. */
  dying: number;
}

/** Barricades: a row of sandbags or planks across their lane, with the HP the crowd has to chew through. */
export class BarricadeView {
  private readonly vis: BarricadeVis[] = [];

  constructor(scene: Phaser.Scene) {
    for (let i = 0; i < MAX_BARRICADES; i++) {
      const segments: Phaser.GameObjects.Image[] = [];
      for (let s = 0; s < MAX_SEGMENTS; s++) {
        segments.push(scene.add.image(0, 0, ATLAS, 'sandbags').setDepth(Depth.Barricades).setVisible(false));
      }
      this.vis.push({
        b: null,
        segments,
        used: 0,
        step: SEGMENT_W,
        label: scene.add.bitmapText(0, 0, NUM_FONT, '', 32).setOrigin(0.5).setTint(0xffd27a).setDepth(Depth.Labels).setVisible(false),
        labelValue: -1,
        dying: -1,
      });
    }
  }

  update(
    dt: number,
    barricades: readonly SimBarricade[],
    distance: number,
    roadX: number,
    crowdY: number,
    viewAhead: number,
    viewBottom: number,
    fx: Effects,
  ): void {
    for (const b of barricades) {
      if (!b.active || b.z - distance > viewAhead + 80) continue;
      if (this.find(b)) continue;
      this.attach(b);
    }

    for (const v of this.vis) {
      const b = v.b;
      if (!b) continue;
      const y = crowdY - (b.z - distance);
      if (!b.active && v.dying < 0) {
        v.dying = 0;
        v.label.setVisible(false);
        for (let s = 0; s < v.used; s++) {
          const seg = v.segments[s];
          fx.burst(seg.x, seg.y, 3, 0xb08a58, 420, 'chunk', 0.5);
        }
        fx.glow(roadX + (b.x0 + b.x1) / 2, y, 220, 0xffe0a0, 0.18);
      }
      if (v.dying >= 0) {
        v.dying += dt;
        if (v.dying > 0.25 || y > viewBottom + 80) {
          this.release(v);
          continue;
        }
      }
      const shake = b.engaged ? (Math.random() - 0.5) * 6 : 0;
      const spread = v.dying >= 0 ? v.dying * 400 : 0;
      const mid = (v.used - 1) / 2;
      for (let s = 0; s < v.used; s++) {
        const seg = v.segments[s];
        seg.setPosition(roadX + b.x0 + v.step * (s + 0.5) + shake + (s - mid) * spread * 0.3, y - spread * 0.2);
        if (v.dying >= 0) seg.setAlpha(1 - v.dying / 0.25);
      }
      if (b.active) {
        const hp = Math.ceil(b.hp);
        if (hp !== v.labelValue) {
          v.labelValue = hp;
          v.label.setText(formatCount(hp));
        }
        v.label.setPosition(roadX + (b.x0 + b.x1) / 2, y - 44);
      }
      if (y > viewBottom + 80) this.release(v);
    }
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
    v.dying = -1;
    v.labelValue = -1;
    v.used = Math.min(MAX_SEGMENTS, Math.max(1, Math.round((b.x1 - b.x0) / SEGMENT_W)));
    v.step = (b.x1 - b.x0) / v.used;
    const frame = b.id % 2 === 0 ? 'sandbags' : 'planks';
    for (let s = 0; s < MAX_SEGMENTS; s++) {
      v.segments[s].setFrame(frame).setAlpha(1).setVisible(s < v.used).setFlipX(s % 2 === 1);
    }
    v.label.setVisible(true);
  }

  private release(v: BarricadeVis): void {
    v.b = null;
    for (const s of v.segments) s.setVisible(false);
    v.label.setVisible(false);
  }

  clear(): void {
    for (const v of this.vis) if (v.b) this.release(v);
  }
}
