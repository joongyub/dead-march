import Phaser from 'phaser';
import { ATLAS, formatCount, NUM_FONT } from '../art/atlas';
import { UNIT_FRAMES } from '../art/sprites';
import { Colors } from '../config';
import type { ParsedOp } from '../sim/types';
import type { BattleWorld } from '../world3d/BattleWorld';
import type { Vec3 } from '../world3d/Crowd3D';
import type { ScreenPoint } from '../world3d/World3D';
import { Depth } from './depth';

const MAX_HORDES = 8;
const MAX_BARRICADES = 4;
const MAX_GATES = 3;

interface GateSide {
  label: Phaser.GameObjects.BitmapText;
  labelW: number;
  word: Phaser.GameObjects.Image;
  icon: Phaser.GameObjects.Image;
  wordOn: boolean;
  iconOn: boolean;
  gate: unknown;
}

interface NumberLabel {
  text: Phaser.GameObjects.BitmapText;
  value: number;
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

/**
 * Numbers that belong to things in the 3D world (gate values, zombie counts, barricade health),
 * drawn by Phaser in the bitmap font at the projected position and sized with the distance, so they
 * read as part of the scene but stay sharp and cost no extra textures.
 */
export class WorldLabels {
  private readonly hordes: NumberLabel[] = [];
  private readonly barricades: NumberLabel[] = [];
  private readonly gates: [GateSide, GateSide][] = [];
  private readonly p: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly s: ScreenPoint = { x: 0, y: 0, scale: 1 };
  /** Screen scale at the army: labels there are drawn at their normal size. */
  private refScale = 1;

  constructor(scene: Phaser.Scene, private readonly bw: BattleWorld) {
    for (let i = 0; i < MAX_HORDES; i++) {
      const text = scene.add.bitmapText(0, 0, NUM_FONT, '', 40).setOrigin(0.5).setTint(Colors.zombieCount).setVisible(false).setDepth(Depth.Labels);
      this.hordes.push({ text, value: -1 });
    }
    for (let i = 0; i < MAX_BARRICADES; i++) {
      const text = scene.add.bitmapText(0, 0, NUM_FONT, '', 38).setOrigin(0.5).setTint(0xffd27a).setVisible(false).setDepth(Depth.Labels);
      this.barricades.push({ text, value: -1 });
    }
    for (let i = 0; i < MAX_GATES; i++) {
      const side = (): GateSide => ({
        label: scene.add.bitmapText(0, 0, NUM_FONT, '', 72).setOrigin(0.5).setDepth(Depth.Labels).setVisible(false),
        labelW: 0,
        word: scene.add.image(0, 0, ATLAS, 'g_merge').setDepth(Depth.Labels).setVisible(false),
        icon: scene.add.image(0, 0, ATLAS, 'u1').setDepth(Depth.Labels).setVisible(false),
        wordOn: false,
        iconOn: false,
        gate: null,
      });
      this.gates.push([side(), side()]);
    }
  }

  update(crowdX: number, distance: number): void {
    const world = this.bw.world;
    if (world.project(crowdX, 0, -distance, this.s)) this.refScale = this.s.scale;
    const ref = this.refScale;

    for (let i = 0; i < MAX_HORDES; i++) {
      const l = this.hordes[i];
      const h = this.bw.zombies.labelPoint(i, this.p);
      if (!h || !world.project(this.p.x, this.p.y, this.p.z, this.s) || this.s.y < 150) {
        if (l.text.visible) l.text.setVisible(false);
        continue;
      }
      if (l.value !== h.count) {
        l.value = h.count;
        l.text.setText(formatCount(h.count));
      }
      l.text.setPosition(this.s.x, this.s.y).setScale(Math.max(0.55, Math.min(1.3, this.s.scale / ref))).setVisible(true);
    }

    for (let i = 0; i < MAX_BARRICADES; i++) {
      const l = this.barricades[i];
      const b = this.bw.barricades.labelPoint(i, this.p);
      if (!b || !world.project(this.p.x, this.p.y, this.p.z, this.s) || this.s.y < 150) {
        if (l.text.visible) l.text.setVisible(false);
        continue;
      }
      const hp = Math.ceil(b.hp);
      if (l.value !== hp) {
        l.value = hp;
        l.text.setText(formatCount(hp));
      }
      l.text.setPosition(this.s.x, this.s.y).setScale(Math.max(0.55, Math.min(1.3, this.s.scale / ref))).setVisible(true);
    }

    for (let i = 0; i < MAX_GATES; i++) {
      for (let s = 0; s < 2; s++) {
        const side = this.gates[i][s];
        const v = this.bw.gates.labelPoint(i, s, this.p);
        if (!v || !v.gate) {
          if (side.gate) this.hide(side);
          continue;
        }
        const g = v.gate;
        if (side.gate !== g) this.show(side, s === 0 ? g.left : g.right, g);
        let alpha = 1;
        let pop = 1;
        if (v.fade >= 0) {
          const t = Math.min(1, v.fade / 0.4);
          if (g.chosen === s) {
            pop = 1 + t * 0.6;
            alpha = 1 - t;
          } else {
            alpha = Math.max(0, 1 - t * 2.5);
          }
        }
        if (alpha <= 0 || !world.project(this.p.x, this.p.y, this.p.z, this.s) || this.s.y < 140) {
          side.label.setVisible(false);
          side.word.setVisible(false);
          side.icon.setVisible(false);
          continue;
        }
        // The glass is ~290 road units wide; keep the label inside it at any distance.
        const k = (this.s.scale / ref) * pop;
        const word = side.wordOn;
        const icon = side.iconOn;
        side.label.setVisible(!word);
        side.word.setVisible(word);
        side.icon.setVisible(icon);
        side.label.setPosition(this.s.x - (icon ? 26 * k : 0), this.s.y).setScale(k).setAlpha(alpha);
        side.word.setPosition(this.s.x, this.s.y).setScale(k * 1.15).setAlpha(alpha);
        side.icon.setPosition(this.s.x + (side.labelW * k) / 2 + 10 * k, this.s.y).setScale(k * 1.25).setAlpha(alpha);
      }
    }
  }

  private show(side: GateSide, op: ParsedOp, gate: unknown): void {
    side.gate = gate;
    const word = op.kind === 'merge' || op.kind === 'split';
    side.wordOn = word;
    side.word.setFrame(op.kind === 'split' ? 'g_split' : 'g_merge');
    side.label.setText(labelFor(op)).setScale(1);
    // Unscaled width, measured once per gate (reading BitmapText.width re-measures the text).
    side.labelW = word ? 0 : side.label.width;
    side.iconOn = op.kind === 'add' && op.tier > 0;
    side.icon.setFrame(UNIT_FRAMES[op.tier]);
  }

  private hide(side: GateSide): void {
    side.gate = null;
    side.label.setVisible(false);
    side.word.setVisible(false);
    side.icon.setVisible(false);
  }

  clear(): void {
    for (const l of this.hordes) l.text.setVisible(false);
    for (const l of this.barricades) l.text.setVisible(false);
    for (const g of this.gates) for (const s of g) this.hide(s);
  }
}
