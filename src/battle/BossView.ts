import Phaser from 'phaser';
import { ATLAS } from '../art/atlas';
import { bossFrame } from '../art/sprites';
import type { SimBoss } from '../sim/BattleSim';
import { Depth } from './depth';
import type { Effects } from './Effects';

const LUNGE_PERIOD = 0.8;

/** The boss at the end of the road: walks in, lunges at the crowd, flashes when shot, explodes when it dies. */
export class BossView {
  private readonly sprite: Phaser.GameObjects.Image;
  private time = 0;
  private lastHp = 0;
  private hurt = 0;
  private lungePhase = 0;
  private dead = false;
  /** Set for one frame when a lunge lands, so the scene can shake the camera and flash the crowd. */
  landed = false;
  x = 0;
  y = 0;

  constructor(scene: Phaser.Scene, private readonly boss: SimBoss) {
    this.sprite = scene.add.image(0, 0, ATLAS, bossFrame(boss.kindId)).setVisible(false).setDepth(Depth.Actors + 0.1);
    const size = boss.kind.radius * 2.2;
    this.sprite.setScale(size / this.sprite.width);
    this.lastHp = boss.hp;
  }

  get visible(): boolean {
    return this.sprite.visible;
  }

  update(dt: number, distance: number, roadX: number, roadCenter: number, crowdY: number, fx: Effects): void {
    this.landed = false;
    const b = this.boss;
    if (this.dead) return;
    if (!b.active) {
      if (b.hp <= 0 && this.sprite.visible) this.die(fx);
      return;
    }
    this.time += dt;
    this.sprite.setVisible(true);
    let lunge = 0;
    if (b.attacking) {
      const before = this.lungePhase;
      this.lungePhase = (this.lungePhase + dt / LUNGE_PERIOD) % 1;
      if (before < 0.5 && this.lungePhase >= 0.5) this.landed = true;
      lunge = Math.max(0, Math.sin(this.lungePhase * Math.PI)) * 34;
    } else {
      this.lungePhase = 0;
    }
    const walk = b.attacking ? 0 : Math.sin(this.time * 6) * 4;
    this.x = roadX + roadCenter + Math.sin(this.time * 1.3) * 18;
    this.y = crowdY - (b.z - distance) + lunge + walk;
    this.sprite.setPosition(this.x, this.y).setRotation(Math.sin(this.time * 3) * 0.04);

    // Flicker while being shot.
    if (b.hp < this.lastHp) {
      this.lastHp = b.hp;
      this.hurt = 0.1;
    }
    if (this.hurt > 0) {
      this.hurt -= dt;
      if (this.hurt > 0 && Math.floor(this.time * 18) % 2 === 0) this.sprite.setTint(0xff9a9a);
      else this.sprite.clearTint();
    }
  }

  private die(fx: Effects): void {
    this.dead = true;
    const { x, y } = this.sprite;
    fx.glow(x, y, 520, 0xffd080, 0.5);
    fx.ring(x, y, 600, 0xffffff, 0.6);
    fx.ring(x, y, 380, 0xff6060, 0.45);
    fx.burst(x, y, 26, 0x8a1838, 700, 'chunk', 0.9);
    fx.burst(x, y, 18, 0xffe080, 520, 'spark', 0.7);
    this.sprite.setVisible(false);
  }

  /** Point on the boss for tracers to hit. */
  targetX(): number {
    return this.x + (Math.random() - 0.5) * this.boss.kind.radius;
  }

  targetY(): number {
    return this.y + (Math.random() - 0.3) * this.boss.kind.radius * 0.8;
  }
}
