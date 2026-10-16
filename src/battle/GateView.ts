import Phaser from 'phaser';
import { ATLAS, NUM_FONT } from '../art/atlas';
import { UNIT_FRAMES } from '../art/sprites';
import { Colors } from '../config';
import { isGoodOp } from '../sim/Army';
import type { SimGate } from '../sim/BattleSim';
import { ROAD_CENTER, ROAD_LEFT, ROAD_RIGHT, type ParsedOp } from '../sim/types';
import { Depth } from './depth';

const MAX_GATES = 3;
const PANEL_W = (ROAD_RIGHT - ROAD_LEFT) / 2 - 14;
const PANEL_H = 92;

interface Side {
  panel: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.BitmapText;
  word: Phaser.GameObjects.Image;
  icon: Phaser.GameObjects.Image;
}

interface GateVis {
  gate: SimGate | null;
  sides: [Side, Side];
  posts: Phaser.GameObjects.Image[];
  fade: number;
}

/** Text for a gate op in the number font: "+20", "×2", "÷3", "-15". */
function labelFor(op: ParsedOp): string {
  switch (op.kind) {
    case 'add':
      return `+${op.value}`;
    case 'sub':
      return `-${op.value}`;
    case 'mul':
      return `×${op.value}`;
    case 'div':
      return `÷${op.value}`;
    default:
      return '';
  }
}

function colorFor(op: ParsedOp): number {
  if (op.kind === 'merge' || op.kind === 'split') return Colors.special;
  return isGoodOp(op) ? Colors.good : Colors.bad;
}

/** Pairs of gates across the road. The side the crowd passes through flashes; the other fades away. */
export class GateView {
  private readonly vis: GateVis[] = [];

  constructor(scene: Phaser.Scene) {
    for (let i = 0; i < MAX_GATES; i++) {
      const side = (): Side => ({
        panel: scene.add.image(0, 0, ATLAS, 'gate').setDisplaySize(PANEL_W, PANEL_H).setDepth(Depth.Gates).setVisible(false),
        label: scene.add.bitmapText(0, 0, NUM_FONT, '', 64).setOrigin(0.5).setDepth(Depth.Gates).setVisible(false),
        word: scene.add.image(0, 0, ATLAS, 'g_merge').setDepth(Depth.Gates).setVisible(false),
        icon: scene.add.image(0, 0, ATLAS, 'u1').setDepth(Depth.Gates).setVisible(false),
      });
      const posts = [0, 1, 2].map(() => scene.add.image(0, 0, ATLAS, 'post').setOrigin(0.5, 1).setDepth(Depth.Gates).setVisible(false));
      this.vis.push({ gate: null, sides: [side(), side()], posts, fade: 0 });
    }
  }

  update(dt: number, gates: readonly SimGate[], distance: number, roadX: number, crowdY: number, viewAhead: number, viewBottom: number): void {
    for (const g of gates) {
      if (g.passed || g.z - distance > viewAhead + 120) continue;
      if (this.find(g)) continue;
      this.attach(g);
    }

    for (const v of this.vis) {
      const g = v.gate;
      if (!g) continue;
      const y = crowdY - (g.z - distance);
      if (g.passed) v.fade += dt;
      if (y > viewBottom + 120 || v.fade > 0.6) {
        this.release(v);
        continue;
      }
      for (let s = 0; s < 2; s++) {
        const side = v.sides[s];
        const cx = roadX + (s === 0 ? (ROAD_LEFT + ROAD_CENTER) / 2 : (ROAD_CENTER + ROAD_RIGHT) / 2);
        let alpha = 1;
        let scale = 1;
        if (g.passed) {
          const t = Math.min(1, v.fade / 0.6);
          if (g.chosen === s) {
            scale = 1 + t * 0.35;
            alpha = 1 - t;
          } else {
            alpha = Math.max(0, 1 - t * 2.5);
          }
        }
        side.panel.setPosition(cx, y).setDisplaySize(PANEL_W * scale, PANEL_H * scale).setAlpha(alpha * 0.82);
        const hasIcon = side.icon.visible;
        side.label.setPosition(cx - (hasIcon ? 26 : 0), y).setScale(scale).setAlpha(alpha);
        side.word.setPosition(cx, y).setScale(scale).setAlpha(alpha);
        side.icon.setPosition(cx + side.label.width / 2 + 8, y).setScale(scale * 1.15).setAlpha(alpha);
      }
      const postAlpha = g.passed ? Math.max(0, 1 - v.fade * 2) : 1;
      v.posts[0].setPosition(roadX + ROAD_LEFT + 4, y + PANEL_H / 2 + 8).setAlpha(postAlpha);
      v.posts[1].setPosition(roadX + ROAD_CENTER, y + PANEL_H / 2 + 8).setAlpha(postAlpha);
      v.posts[2].setPosition(roadX + ROAD_RIGHT - 4, y + PANEL_H / 2 + 8).setAlpha(postAlpha);
    }
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
    v.fade = 0;
    for (let s = 0; s < 2; s++) {
      const op = s === 0 ? g.left : g.right;
      const side = v.sides[s];
      side.panel.setTint(colorFor(op)).setVisible(true);
      const word = op.kind === 'merge' || op.kind === 'split';
      side.word.setFrame(op.kind === 'split' ? 'g_split' : 'g_merge').setVisible(word);
      side.label.setText(labelFor(op)).setVisible(!word);
      const unit = op.kind === 'add' && op.tier > 0;
      side.icon.setFrame(UNIT_FRAMES[op.tier]).setVisible(unit);
    }
    for (const p of v.posts) p.setVisible(true);
  }

  private release(v: GateVis): void {
    v.gate = null;
    for (const side of v.sides) {
      side.panel.setVisible(false);
      side.label.setVisible(false);
      side.word.setVisible(false);
      side.icon.setVisible(false);
    }
    for (const p of v.posts) p.setVisible(false);
  }

  /** Screen x of the middle of a gate side (for popups). */
  static sideX(side: 0 | 1, roadX: number): number {
    return roadX + (side === 0 ? (ROAD_LEFT + ROAD_CENTER) / 2 : (ROAD_CENTER + ROAD_RIGHT) / 2);
  }
}
