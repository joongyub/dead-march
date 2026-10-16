import Phaser from 'phaser';
import { ATLAS, formatCount, NUM_FONT } from '../art/atlas';
import { audio } from '../audio/Audio';
import { zombieFrame } from '../art/sprites';
import { Colors } from '../config';
import type { SimHorde } from '../sim/BattleSim';
import { Depth } from './depth';
import type { Effects } from './Effects';

/** Zombie sprites shared by all hordes on screen. Crowd (90) + zombies stays within the 200-sprite budget. */
export const MAX_ZOMBIE_SPRITES = 110;
const MAX_PER_HORDE = 32;
const MAX_HORDES = 8;
const ZOMBIE_BLOOD = 0x5e0f22;

const SPACING: Record<string, number> = { walker: 32, runner: 32, exploder: 40, brute: 62 };
const PER_HORDE: Record<string, number> = { walker: 30, runner: 26, exploder: 20, brute: 12 };

interface HordeVis {
  horde: SimHorde | null;
  k: number;
  alive: number;
  idx: Int16Array;
  dx: Float32Array;
  dz: Float32Array;
  ph: Float32Array;
  depth: number;
  label: Phaser.GameObjects.BitmapText;
  labelValue: number;
}

/**
 * Draws each zombie group as up to 32 representative zombies plus its real count. Zombies die front row
 * first as the count drops, leaving blood on the road.
 */
export class HordeView {
  private readonly sprites: Phaser.GameObjects.Image[] = [];
  private readonly free: Int16Array = new Int16Array(MAX_ZOMBIE_SPRITES);
  private freeCount = 0;
  private readonly vis: HordeVis[] = [];
  /** Seconds left of each zombie's white hit flash. */
  private readonly flashLeft = new Float32Array(MAX_ZOMBIE_SPRITES);
  private time = 0;

  constructor(scene: Phaser.Scene) {
    for (let i = 0; i < MAX_ZOMBIE_SPRITES; i++) {
      this.sprites.push(scene.add.image(0, 0, ATLAS, 'z_walker').setVisible(false).setDepth(Depth.Actors + 0.2));
      this.free[this.freeCount++] = i;
    }
    for (let i = 0; i < MAX_HORDES; i++) {
      this.vis.push({
        horde: null,
        k: 0,
        alive: 0,
        idx: new Int16Array(MAX_PER_HORDE),
        dx: new Float32Array(MAX_PER_HORDE),
        dz: new Float32Array(MAX_PER_HORDE),
        ph: new Float32Array(MAX_PER_HORDE),
        depth: 0,
        label: scene.add.bitmapText(0, 0, NUM_FONT, '', 34).setOrigin(0.5).setTint(Colors.zombieCount).setVisible(false).setDepth(Depth.Labels),
        labelValue: -1,
      });
    }
  }

  get spriteCount(): number {
    return MAX_ZOMBIE_SPRITES - this.freeCount;
  }

  update(
    dt: number,
    hordes: readonly SimHorde[],
    distance: number,
    roadX: number,
    crowdY: number,
    viewAhead: number,
    viewBottom: number,
    fx: Effects,
  ): void {
    this.time += dt;

    // Start drawing hordes that came into view.
    for (const h of hordes) {
      if (!h.active || h.z - distance > viewAhead + 80 || h.z - distance < -300) continue;
      if (this.find(h)) continue;
      this.attach(h);
    }

    for (const v of this.vis) {
      const h = v.horde;
      if (!h) continue;
      const target = h.count > 0 ? Math.max(1, Math.ceil((h.count / h.count0) * v.k)) : 0;
      // Front zombies (low index) die first.
      while (v.alive > target) {
        const j = v.k - v.alive;
        const s = this.sprites[v.idx[j]];
        if (s.visible) this.kill(s, h, fx, roadX, distance, crowdY);
        s.setVisible(false);
        v.alive--;
      }

      let maxY = -Infinity;
      let minY = Infinity;
      const moving = h.aggro && !h.engaged;
      const speed = h.kind.speed > 100 ? 16 : 6;
      for (let j = v.k - v.alive; j < v.k; j++) {
        const s = this.sprites[v.idx[j]];
        const ph = v.ph[j];
        const sway = Math.sin(this.time * 2.6 + ph) * 3;
        const bob = moving ? Math.abs(Math.sin(this.time * speed + ph)) * 3 : 0;
        const shake = h.engaged ? (Math.random() - 0.5) * 4 : 0;
        const y = crowdY - (h.z + v.dz[j] - distance) - bob;
        s.setPosition(roadX + v.dx[j] + sway + shake, y);
        const idx = v.idx[j];
        if (this.flashLeft[idx] > 0) {
          this.flashLeft[idx] -= dt;
          if (this.flashLeft[idx] <= 0) s.clearTint();
        }
        if (y > maxY) maxY = y;
        if (y < minY) minY = y;
      }

      if (v.alive > 0 && h.count > 0 && minY < viewBottom) {
        if (v.labelValue !== h.count) {
          v.labelValue = h.count;
          v.label.setText(formatCount(h.count));
        }
        v.label.setPosition(roadX + (h.x0 + h.x1) / 2, minY - 38).setVisible(true);
      } else {
        v.label.setVisible(false);
      }

      if (v.alive === 0 || minY > viewBottom + 60) this.release(v);
    }
  }

  private find(h: SimHorde): HordeVis | null {
    for (const v of this.vis) if (v.horde === h) return v;
    return null;
  }

  private attach(h: SimHorde): void {
    let v: HordeVis | null = null;
    for (const c of this.vis) {
      if (!c.horde) {
        v = c;
        break;
      }
    }
    if (!v) return;
    const k = Math.min(h.count, PER_HORDE[h.kindId] ?? 24, MAX_PER_HORDE, this.freeCount);
    if (k <= 0) return;
    v.horde = h;
    v.k = k;
    v.alive = k;
    v.labelValue = -1;
    const spacing = SPACING[h.kindId] ?? 28;
    const width = Math.max(spacing, h.x1 - h.x0 - spacing * 0.8);
    const cols = Math.max(1, Math.min(Math.floor(width / spacing), Math.ceil(Math.sqrt(k * 3))));
    const rows = Math.ceil(k / cols);
    const depth = rows * spacing * 0.8;
    // Random spots inside the lane, then sorted front to back so the front ones die first.
    for (let j = 0; j < k; j++) {
      v.dx[j] = h.x0 + spacing * 0.4 + Math.random() * width;
      v.dz[j] = Math.random() * depth;
      v.ph[j] = Math.random() * Math.PI * 2;
    }
    for (let a = 1; a < k; a++) {
      const dz = v.dz[a];
      const dx = v.dx[a];
      let b = a - 1;
      while (b >= 0 && v.dz[b] > dz) {
        v.dz[b + 1] = v.dz[b];
        v.dx[b + 1] = v.dx[b];
        b--;
      }
      v.dz[b + 1] = dz;
      v.dx[b + 1] = dx;
    }
    const frame = zombieFrame(h.kindId);
    const scale = h.kindId === 'brute' ? 1.2 : 1.35;
    for (let j = 0; j < k; j++) {
      const i = this.free[--this.freeCount];
      v.idx[j] = i;
      // Farther back draws behind; zombies always draw under the crowd.
      this.sprites[i].setFrame(frame).setScale(scale).clearTint().setVisible(true).setDepth(Depth.Actors + 0.2 + (depth - v.dz[j]) / 10000);
    }
  }

  /** White hit flash on one of the front zombies of a horde being shot. */
  flashRandom(h: SimHorde): void {
    const v = this.find(h);
    if (!v || v.alive === 0) return;
    const j = v.k - v.alive + Math.floor(Math.random() * Math.min(v.alive, 5));
    const idx = v.idx[j];
    if (this.flashLeft[idx] > 0) return;
    this.flashLeft[idx] = 0.05;
    this.sprites[idx].setTintFill(0xffffff);
  }

  private kill(s: Phaser.GameObjects.Image, h: SimHorde, fx: Effects, roadX: number, distance: number, crowdY: number): void {
    const z = distance + (crowdY - s.y);
    s.clearTint();
    if (h.kindId === 'exploder') {
      audio.play('explode', 0.6);
      fx.glow(s.x, s.y, 150, 0xffa030, 0.22);
      fx.ring(s.x, s.y, 140, 0xffb040, 0.3);
      fx.burst(s.x, s.y, 6, 0xffc040, 380, 'spark', 0.35);
      fx.decal(s.x - roadX, z, 0x3a2a10, 0.9);
      return;
    }
    audio.play('zombieDie', 0.7);
    fx.decal(s.x - roadX, z, ZOMBIE_BLOOD, h.kindId === 'brute' ? 0.9 : 0.5 + Math.random() * 0.2);
    fx.burst(s.x, s.y, h.kindId === 'brute' ? 5 : 2, 0x8a1838, 220, 'chunk', 0.3);
  }

  private release(v: HordeVis): void {
    for (let j = 0; j < v.k; j++) {
      const i = v.idx[j];
      this.flashLeft[i] = 0;
      this.sprites[i].clearTint().setVisible(false);
      this.free[this.freeCount++] = i;
    }
    v.horde = null;
    v.k = 0;
    v.alive = 0;
    v.label.setVisible(false);
  }

  /** Screen position of a random live zombie of the horde, for tracer targets. Returns false if none. */
  targetPoint(h: SimHorde, out: { x: number; y: number }): boolean {
    const v = this.find(h);
    if (!v || v.alive === 0) return false;
    const front = v.k - v.alive;
    const j = front + Math.floor(Math.random() * Math.min(v.alive, 6));
    const s = this.sprites[v.idx[j]];
    out.x = s.x;
    out.y = s.y;
    return true;
  }

  clear(): void {
    for (const v of this.vis) if (v.horde) this.release(v);
  }
}
