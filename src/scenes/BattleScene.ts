import Phaser from 'phaser';
import { ATLAS, formatCount } from '../art/atlas';
import { audio } from '../audio/Audio';
import { Depth } from '../battle/depth';
import { Effects } from '../battle/Effects';
import { Hud } from '../battle/Hud';
import { stressLevel } from '../battle/stressLevel';
import { BattleTutorial, type BattleScreen } from '../battle/Tutorial';
import { WorldLabels } from '../battle/WorldLabels';
import { Colors, FONT_FAMILY, SceneKeys } from '../config';
import { setFrameCap } from '../core/frameRate';
import { FixedTimestep } from '../core/FixedTimestep';
import { lowSpecWanted, quality, setLowSpec, SlowFrameDetector, viewHeight, viewWidth } from '../core/quality';
import { recordBattle } from '../game/progress';
import { services } from '../services';
import { stageName, t, zombieName } from '../i18n';
import { shelterModifiers } from '../meta/shelter';
import { save } from '../game/save';
import { flags } from '../platform/flags';
import { vibrate } from '../platform/haptics';
import { BattleSim, SALVO_FLIGHT, type BattleModifiers, type SimGate, type SimHorde } from '../sim/BattleSim';
import { getLevel, RULES } from '../sim/rules';
import { ROAD_CENTER, ROAD_LEFT, ROAD_RIGHT, type LevelData } from '../sim/types';
import type { BattleWorld } from '../world3d/BattleWorld';
import type { Vec3 } from '../world3d/Crowd3D';
import { GATE_LABEL_Y, sideX } from '../world3d/layout';
import { battleWorld } from '../world3d/registry';
import type { ScreenPoint } from '../world3d/World3D';
import { BaseScene } from './BaseScene';

export interface BattleData {
  stage?: number;
  stress?: boolean;
  modifiers?: BattleModifiers;
}

/** Finger movement → crowd movement. A little above 1 so a thumb can cross the road without lifting. */
const DRAG_GAIN = 1.25;
const TRACER_TINTS = [0xfff2c0, 0xffe27a, 0xffb24a, 0xff8a3a];
const TRACER_WIDTH = [4.5, 5.5, 7.5, 16];
const FLASH_SIZE = [26, 34, 46, 84];
const PUSH = [2, 4, 7, 16];
const TIER_RANGES = RULES.tiers.map((t) => t.range);
const BENCH_TINTS = [0x5fb3ff, 0x6fd16f, 0xffd166, 0xc77dff];
const ZOMBIE_BLOOD = 0x6e0f22;
const HUMAN_BLOOD = 0x9a1020;

/**
 * The runner battle. Rules live in BattleSim (stepped at a fixed 60 Hz); this scene feeds it the
 * finger position and shows its state in the 3D world (world3d/), interpolated to the screen's
 * refresh rate, with the HUD and numbers drawn by Phaser on top.
 */
export class BattleScene extends BaseScene {
  private readonly timestep = new FixedTimestep();
  private sim!: BattleSim;
  private level!: LevelData;
  private stress = false;

  private bw!: BattleWorld;
  private labels!: WorldLabels;
  private fx!: Effects;
  private hud!: Hud;
  private tutorial!: BattleTutorial;
  /** White full-screen flash (boss kill). */
  private flash!: Phaser.GameObjects.Image;

  private prevDistance = 0;
  private prevCrowdX = ROAD_CENTER;
  private targetX = ROAD_CENTER;
  private dragging = false;
  private dragStartX = 0;
  private dragStartTarget = ROAD_CENTER;
  private keys: Phaser.Types.Input.Keyboard.CursorKeys | null = null;

  private hitStop = 0;
  private slowMo = 0;
  private endTimer = -1;
  private ended = false;
  private shotAcc = 0;
  private contactAcc = 0;
  private powerSeen = 0;
  /** Army lost since the last red number, and time until the next one. */
  private lossAcc = 0;
  private lossTimer = 0;
  private lastMergePopup = 0;
  private distance = 0;
  private crowdX = ROAD_CENTER;
  private readonly from: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly to: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly sp: ScreenPoint = { x: 0, y: 0, scale: 1 };
  /** Army on screen: feet, and the spot above it where its size is shown. */
  private readonly crowdScreen = { x: 360, y: 900 };
  private readonly pill = { x: 360, y: 760 };
  private readonly screen: BattleScreen = {
    crowd: this.crowdScreen,
    gate: (g: SimGate, side: number, out: { x: number; y: number }) => this.gateOnScreen(g, side, out),
  };
  private readonly slowFrames = new SlowFrameDetector();
  private readonly stepFn = (dt: number) => this.step(dt);

  private benchSprites: Phaser.GameObjects.Image[] = [];
  private benchVel = new Float32Array(0);

  constructor() {
    super(SceneKeys.Battle);
  }

  create(data: BattleData): void {
    const bw = battleWorld();
    if (!bw) {
      this.no3d();
      return;
    }
    this.bw = bw;
    setFrameCap(this.game, 0);
    this.stress = data.stress ?? flags.stress;
    this.level = this.stress ? stressLevel() : getLevel(data.stage ?? save.data.unlocked);
    // The stress test measures raw cost, so it ignores shelter upgrades.
    const modifiers = data.modifiers ?? (this.stress ? undefined : shelterModifiers(save.data.buildings));
    this.sim = new BattleSim(this.level, RULES, modifiers);
    if (!this.stress) services.analytics.log('stage_start', { stage: this.level.id });
    this.timestep.reset();
    this.prevDistance = 0;
    this.prevCrowdX = this.sim.crowdX;
    this.targetX = this.sim.crowdX;
    this.distance = 0;
    this.crowdX = this.sim.crowdX;
    this.dragging = false;
    this.hitStop = 0;
    this.slowMo = 0;
    this.endTimer = -1;
    this.ended = false;
    this.shotAcc = 0;
    this.contactAcc = 0;
    this.powerSeen = this.sim.army.power;
    this.lossAcc = 0;
    this.lossTimer = 0;
    this.slowFrames.reset();

    bw.begin(this.sim, this.stress ? 1 : this.level.id);
    bw.fx.density = quality.particleScale;
    bw.world.shakeEnabled = save.data.settings.shake;
    bw.world.attach(this);
    this.labels = new WorldLabels(this, bw);
    // Phaser only draws numbers and words now; everything else is in 3D.
    this.fx = new Effects(this, Depth.Decals, Depth.Fx, Depth.FxAdd, Depth.Labels, { normal: 10, add: 0, decals: 0, texts: 12 });
    const stageLabel = this.stress ? t('battle.stress') : `${this.level.id}. ${stageName(this.level)}`;
    const bossLabel = t('battle.boss', { name: zombieName(this.sim.boss.kindId, this.sim.boss.kind.name) });
    this.hud = new Hud(this, stageLabel, bossLabel, () => this.openPause());
    this.tutorial = new BattleTutorial(this, this.stress ? 0 : this.level.id);
    this.flash = this.add.image(0, 0, ATLAS, 'px').setOrigin(0).setDepth(Depth.Hud - 1).setAlpha(0);
    this.createBench(flags.bench);
    audio.playMusic('battle');

    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    this.input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp, this);
    this.keys = this.input.keyboard?.createCursorKeys() ?? null;

    // Losing the screen mid-battle (home button, call, notification shade) always lands on the pause menu.
    this.game.events.on(Phaser.Core.Events.HIDDEN, this.openPause, this);
    this.game.events.on(Phaser.Core.Events.BLUR, this.openPause, this);
    this.events.on(Phaser.Scenes.Events.RESUME, this.onResume, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(Phaser.Scenes.Events.RESUME, this.onResume, this);
      this.game.events.off(Phaser.Core.Events.HIDDEN, this.openPause, this);
      this.game.events.off(Phaser.Core.Events.BLUR, this.openPause, this);
      this.input.off(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
      this.input.off(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
      this.input.off(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
      this.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp, this);
      this.benchSprites = [];
    });

    // The sky is the haze color; the 3D world draws over it.
    this.cameras.main.setBackgroundColor(bw.fogFor(this.stress ? 1 : this.level.id));
    this.enter();
    this.bindLayout();
    this.render(0);
    // Expose for automated checks (?debug=1 only).
    if (flags.debug) Object.assign(window, { __battle: this });
  }

  /** Devices without WebGL2 cannot draw the battle: say so and go back. */
  private no3d(): void {
    this.cameras.main.setBackgroundColor(Colors.background);
    this.add
      .text(viewWidth(this.scale) / 2, viewHeight(this.scale) / 2, t('battle.no3d'), { fontFamily: FONT_FAMILY, fontSize: '30px', color: Colors.text })
      .setOrigin(0.5);
    this.time.delayedCall(2500, () => this.scene.start(SceneKeys.Lobby));
    this.ended = true;
  }

  /** Stage being played (0 = stress test); the pause menu's retry uses it. */
  get stageId(): number {
    return this.level.id;
  }

  /** Read by the debug overlay and the smoke test. */
  get debugInfo(): { units: number; zombies: number; fx: number; power: number; phase: string; distance: number; instances: number } {
    return {
      units: this.bw.crowd.count,
      zombies: this.bw.zombies.liveCount,
      fx: this.bw.fx.activeCount + this.fx.activeCount,
      power: this.sim.army.power,
      phase: this.sim.phase,
      distance: Math.round(this.sim.distance),
      instances: this.bw.crowd.instances + this.bw.zombies.instances,
    };
  }

  /** Removes every effect on screen (store screenshots). */
  clearEffects(): void {
    this.fx.clear();
    this.bw.fx.clear();
  }

  override update(_time: number, delta: number): void {
    if (!this.bw || !this.sim) return;
    let simDelta = delta;
    let fxScale = 1;
    if (this.hitStop > 0) {
      this.hitStop -= delta;
      simDelta = 0;
      fxScale = 0.15;
    } else if (this.slowMo > 0) {
      this.slowMo -= delta;
      simDelta = delta * 0.3;
      fxScale = 0.4;
    }
    // A lesson on screen slows the battle so there is time to read it.
    simDelta *= this.tutorial.timeScale;
    if (this.keys) {
      const dir = (this.keys.right.isDown ? 1 : 0) - (this.keys.left.isDown ? 1 : 0);
      if (dir !== 0) {
        this.targetX = Phaser.Math.Clamp(this.targetX + dir * 900 * (delta / 1000), ROAD_LEFT, ROAD_RIGHT);
        this.tutorial.onDrag(900 * (delta / 1000));
      }
    }

    const alpha = this.timestep.advance(simDelta, this.stepFn);
    this.distance = this.prevDistance + (this.sim.distance - this.prevDistance) * alpha;
    this.crowdX = this.prevCrowdX + (this.sim.crowdX - this.prevCrowdX) * alpha;
    this.render((delta / 1000) * fxScale);

    if (this.endTimer >= 0) {
      this.endTimer -= delta;
      if (this.endTimer < 0) this.finish();
    }
    if (this.benchSprites.length > 0) this.stepBench(delta / 1000);
    // Raw frame time: Phaser's smoothed delta swaps frames over 200ms for an earlier normal one.
    if (!quality.low && save.data.settings.lowSpec === 'auto' && this.slowFrames.push(this.game.loop.rawDelta)) this.enterLowSpec();
  }

  /** Battles keep running slow on this device: lighter settings from now on (and next launch). */
  private enterLowSpec(): void {
    save.data.device.lowSpec = true;
    save.commit();
    setLowSpec(this.game, lowSpecWanted(save.data.settings.lowSpec, true));
    this.bw.fx.density = quality.particleScale;
    // A one-time note so the softer picture is not a mystery.
    const note = this.add
      .text(viewWidth(this.scale) / 2, this.insets.top + 250, t('battle.lowSpec'), {
        fontFamily: FONT_FAMILY,
        fontSize: '26px',
        color: '#ffffff',
        backgroundColor: 'rgba(8,10,14,0.75)',
        padding: { x: 18, y: 10 },
      })
      .setOrigin(0.5)
      .setDepth(Depth.HudText);
    this.tweens.add({ targets: note, alpha: 0, delay: 2600, duration: 400, onComplete: () => note.destroy() });
  }

  override onBack(): boolean {
    this.openPause();
    return true;
  }

  openPause(): void {
    if (!this.scene.isActive() || this.scene.isPaused() || this.ended) return;
    this.dragging = false;
    this.scene.pause();
    this.scene.launch(SceneKeys.Pause);
    // The pause menu barely moves; half the frame rate saves battery.
    setFrameCap(this.game, 30);
  }

  private onResume(): void {
    setFrameCap(this.game, 0);
  }

  protected layout(width: number, height: number): void {
    if (!this.bw) return;
    this.flash.setDisplaySize(width, height);
    this.hud.layout(width, height, this.insets);
  }

  // ---------- input ----------

  private onPointerDown(p: Phaser.Input.Pointer): void {
    this.dragging = true;
    this.dragStartX = p.x / quality.renderScale;
    this.dragStartTarget = this.targetX;
  }

  private onPointerMove(p: Phaser.Input.Pointer): void {
    if (!this.dragging || !p.isDown) return;
    // Pointer positions are in canvas pixels; game units differ in low-spec mode.
    const x = p.x / quality.renderScale;
    this.targetX = Phaser.Math.Clamp(this.dragStartTarget + (x - this.dragStartX) * DRAG_GAIN, ROAD_LEFT, ROAD_RIGHT);
    this.tutorial.onDrag((p.x - p.prevPosition.x) / quality.renderScale);
  }

  private onPointerUp(): void {
    this.dragging = false;
  }

  // ---------- simulation ----------

  private step(dt: number): void {
    const sim = this.sim;
    this.prevDistance = sim.distance;
    this.prevCrowdX = sim.crowdX;
    sim.setTargetX(this.targetX);
    sim.step(dt);
    if (sim.events.length > 0) this.handleEvents();
  }

  private handleEvents(): void {
    const sim = this.sim;
    const fx = this.fx;
    const fx3 = this.bw.fx;
    const world = this.bw.world;
    const crowd = this.bw.crowd;
    // Positions of this step (the crowd moved since the last frame was drawn).
    const cx = sim.crowdX;
    const cz = -sim.distance;
    const r = sim.crowdRadius;
    // Above the army size label.
    const px = this.pill.x;
    const numberY = this.pill.y - 80;
    const wordY = this.pill.y - 170;
    for (const e of sim.events) {
      this.tutorial.onEvent(e);
      switch (e.type) {
        case 'gate': {
          const delta = sim.army.power - e.powerBefore;
          const op = e.side === 0 ? e.gate.left : e.gate.right;
          if (op.kind === 'merge' || op.kind === 'split') {
            fx.popup(op.kind === 'merge' ? 'w_merge' : 'w_split', px, wordY, 0.8, 0xffd27a);
          }
          if (delta !== 0) {
            fx.number(px, numberY, `${delta > 0 ? '+' : ''}${delta}`, delta > 0 ? 0x7fe3ff : 0xff6b6b, 58);
          }
          const hex = delta >= 0 ? 0x6fc8ff : 0xff5050;
          fx3.shock(cx, cz, r * 4 + 200, hex, 0.35);
          fx3.glow(cx, 40, cz, r * 2.5 + 120, hex, 0.25, 0.7);
          if (delta >= 0) {
            for (let k = 0; k < 8; k++) fx3.sparks(cx + (Math.random() - 0.5) * r * 1.6, 10, cz + (Math.random() - 0.5) * r, 1, 0x9fe0ff, 380, 0.5);
            world.punch(2.5);
          } else {
            crowd.hitFront(1);
            world.shake(0.3);
          }
          audio.play(delta >= 0 ? 'gateGood' : 'gateBad');
          this.powerSeen = sim.army.power;
          vibrate(delta >= 0 ? 15 : 40);
          break;
        }
        case 'merge': {
          audio.play('merge', 1, e.tier * 200);
          fx3.shock(cx, cz, r * 3 + 160, 0xffe08a, 0.3);
          fx3.glow(cx, 30, cz, r * 2 + 120, 0xfff1a8, 0.22, 0.8);
          fx3.sparks(cx, 20, cz, 6, 0xffe080, 420, 0.5);
          const now = this.time.now;
          if (now - this.lastMergePopup > 700) {
            this.lastMergePopup = now;
            fx.popup('w_merge', px, wordY, 0.75, e.tier === 3 ? 0xffd27a : 0xffffff);
          }
          if (e.tier === 3) {
            world.shake(0.35);
            world.punch(3);
            vibrate(30);
          }
          break;
        }
        case 'frontLine':
          // A group reached the army's front line: it stops there and is shot down point-blank.
          audio.play('shotHeavy');
          world.shake(0.25);
          world.punch(1.5);
          vibrate(20);
          break;
        case 'salvo': {
          const shells = Math.max(2, Math.round(e.salvo.shells * quality.particleScale));
          this.bw.shells.fire(e.salvo.horde, cx, cz, r, shells, SALVO_FLIGHT);
          break;
        }
        case 'hordeCleared':
          this.killSlam(e.horde, e.atLine);
          break;
        case 'barricadeSmashed':
          audio.play('smash');
          this.hitStop = 70;
          world.shake(0.6);
          world.punch(4);
          fx.popup('w_smash', px, wordY, 0.8, 0xffd27a);
          vibrate(50);
          break;
        case 'barricadeBroken':
          audio.play('smash', 0.6);
          world.shake(0.3);
          break;
        case 'bossStart':
          audio.play('bossRoar');
          fx.popup('w_boss', viewWidth(this.scale) / 2, viewHeight(this.scale) * 0.36, 1.4, 0xff7070);
          this.hud.showBoss();
          world.shake(0.45);
          vibrate(60);
          break;
        case 'won':
          audio.play('explode');
          audio.play('win');
          audio.stopMusic();
          this.flash.setAlpha(0.8);
          this.slowMo = 1100;
          world.shake(0.9);
          world.punch(8);
          this.endTimer = 1700;
          this.ended = true;
          vibrate(120);
          break;
        case 'lost':
          audio.play('lose');
          audio.stopMusic();
          crowd.wipe();
          world.shake(0.8);
          this.endTimer = 1300;
          this.ended = true;
          vibrate(200);
          break;
      }
    }
    sim.events.length = 0;
  }

  // ---------- drawing ----------

  private render(dt: number): void {
    const sim = this.sim;
    const bw = this.bw;
    const distance = this.distance;
    const crowdX = this.crowdX;
    bw.update(dt, sim, distance, crowdX, sim.phase === 'run' && sim.speed > 60);

    const world = bw.world;
    if (world.project(crowdX, 0, -distance, this.sp)) {
      this.crowdScreen.x = this.sp.x;
      this.crowdScreen.y = this.sp.y;
    }
    if (world.project(crowdX, 50, -distance - sim.crowdRadius * 0.85, this.sp)) {
      this.pill.x = this.sp.x;
      this.pill.y = this.sp.y - 64;
    }

    if (bw.boss.landed) {
      audio.play('clash', 0.8);
      bw.crowd.hitFront(2);
      bw.fx.gore(crowdX, 25, -distance - sim.crowdRadius * 0.7, HUMAN_BLOOD, 1, 0, 1);
      world.shake(0.45);
      world.punch(2);
      vibrate(35);
    }
    if (bw.boss.died) world.punch(6);
    this.updateShooting(dt);
    this.updateContact(dt);
    this.updateLosses(dt);
    this.labels.update(crowdX, distance);
    this.fx.update(dt, 0, 0, 0, Infinity);
    this.hud.update(dt, sim, this.pill.x, this.pill.y);
    if (this.flash.alpha > 0) this.flash.setAlpha(Math.max(0, this.flash.alpha - dt * 2.5));
    this.tutorial.update(dt, sim, this.screen, this.hud.tierIconAt(1));
  }

  private gateOnScreen(g: SimGate, side: number, out: { x: number; y: number }): boolean {
    if (!this.bw.world.project(sideX(side), GATE_LABEL_Y - 40, -g.z, this.sp)) return false;
    out.x = this.sp.x;
    out.y = this.sp.y;
    return true;
  }

  /** Shots from random units to the current target; the rate grows with the army but is capped. */
  private updateShooting(dt: number): void {
    const sim = this.sim;
    if (sim.firePower <= 0 || sim.finished) return;
    const bw = this.bw;
    const fx = bw.fx;
    const rate = Math.min(34, 5 + bw.crowd.count * 0.45) * quality.particleScale;
    this.shotAcc += dt * rate;
    while (this.shotAcc >= 1) {
      this.shotAcc -= 1;
      let tz: number;
      let j = -1;
      const p = this.to;
      if (sim.targetKind === 'horde' && sim.targetHorde) {
        j = bw.zombies.target(sim.targetHorde, p);
        if (j < 0) continue;
        tz = sim.targetHorde.z;
      } else if (sim.targetKind === 'barricade' && sim.targetBarricade) {
        const b = sim.targetBarricade;
        p.x = b.x0 + Math.random() * (b.x1 - b.x0);
        p.y = 10 + Math.random() * 22;
        p.z = -b.z + 6;
        tz = b.z;
      } else if (sim.targetKind === 'boss' && bw.boss.visible) {
        bw.boss.target(p);
        tz = sim.boss.z;
      } else {
        continue;
      }
      const shooter = bw.crowd.pickShooter(tz - this.distance, TIER_RANGES);
      if (shooter < 0) continue;
      const tier = bw.crowd.shooterTier(shooter);
      const m = this.from;
      bw.crowd.muzzle(shooter, m);
      fx.flash(m.x, m.y, m.z, FLASH_SIZE[tier]);
      if (tier > 0) fx.glow(m.x, m.y, m.z, FLASH_SIZE[tier] * 1.6, 0xffc060, 0.06, 0.6);
      fx.tracer(m.x, m.y, m.z, p.x, p.y, p.z, TRACER_TINTS[tier], TRACER_WIDTH[tier], tier === 3 ? 3600 : 5200);
      bw.crowd.recoil(shooter, tier === 3 ? 9 : 2);
      audio.play(tier === 3 ? 'cannon' : tier === 2 ? 'shotHeavy' : 'shot');
      if (tier === 2 && Math.random() < 0.5) {
        // Brass flying out of the machine gun.
        fx.debris.spawn(m.x + 6, m.y - 4, m.z + 12, 120 + Math.random() * 80, 160 + Math.random() * 120, 40, 1.6, 1.6, 4, 0xe8c34a, 0.8);
      }
      if (tier === 3) {
        // Shell: an explosion where it lands, throwing the zombies around it.
        fx.explosion(p.x, 0, p.z, 0.55);
        bw.world.shake(0.14);
        bw.world.punch(1);
        if (sim.targetKind === 'horde' && sim.targetHorde) bw.zombies.blast(sim.targetHorde, p.x, p.z);
      }
      if (sim.targetKind === 'horde' && sim.targetHorde) {
        bw.zombies.hit(sim.targetHorde, j, PUSH[tier]);
        if (tier < 3) fx.hit(p.x, p.y, p.z, ZOMBIE_BLOOD, tier >= 2);
        if (tier > 0 && tier < 3 && Math.random() < 0.3) {
          // Blood bursts out of the back of the wound, away from the shooter.
          const dx = p.x - m.x;
          const dz = p.z - m.z;
          const len = Math.sqrt(dx * dx + dz * dz) || 1;
          fx.spurt(p.x, p.y, p.z, ZOMBIE_BLOOD, dx / len, dz / len, tier === 2 ? 0.9 : 0.6);
        }
      } else if (sim.targetKind === 'boss') {
        fx.hit(p.x, p.y, p.z, ZOMBIE_BLOOD, true);
        if (Math.random() < 0.15) audio.play('bossHit');
      } else if (tier < 3) {
        fx.sparks(p.x, p.y, p.z, 2, 0xffe0a0, 260, 0.25);
      }
    }
  }

  /**
   * A group held at the front line: the front row fires point-blank across the gap, so the line
   * flickers with muzzle flashes and the zombies there jerk and bleed. Nobody crosses the gap.
   */
  private updateContact(dt: number): void {
    const sim = this.sim;
    const bw = this.bw;
    const fx = bw.fx;
    for (const h of sim.hordes) {
      if (!h.active || !h.held) continue;
      this.contactAcc += dt * 22 * quality.particleScale;
      const r = sim.crowdRadius;
      const x0 = Math.max(h.x0, sim.crowdX - r);
      const x1 = Math.min(h.x1, sim.crowdX + r);
      const muzzleZ = -(this.distance + r * 0.75);
      const p = this.to;
      while (this.contactAcc >= 1) {
        this.contactAcc -= 1;
        const x = x0 + Math.random() * Math.max(10, x1 - x0);
        const y = 22 + Math.random() * 10;
        fx.flash(x, y, muzzleZ, 30);
        const j = bw.zombies.target(h, p);
        if (j < 0) {
          fx.tracer(x, y, muzzleZ, x, y, muzzleZ - sim.frontLine + r, TRACER_TINTS[1], TRACER_WIDTH[1], 5200);
          continue;
        }
        fx.tracer(x, y, muzzleZ, p.x, p.y, p.z, TRACER_TINTS[1], TRACER_WIDTH[1], 5200);
        bw.zombies.hit(h, j, PUSH[1]);
        fx.hit(p.x, p.y, p.z, ZOMBIE_BLOOD, Math.random() < 0.4);
        if (Math.random() < 0.35) fx.spurt(p.x, p.y, p.z, ZOMBIE_BLOOD, 0, -1, 0.7);
        audio.play('shot');
      }
    }
  }

  /** Army lost at the front line, to barricades and the boss shows up as red numbers every quarter second. */
  private updateLosses(dt: number): void {
    const power = this.sim.army.power;
    if (power < this.powerSeen) {
      this.lossAcc += this.powerSeen - power;
      this.bw.crowd.hitFront();
    }
    this.powerSeen = power;
    this.lossTimer -= dt;
    if (this.lossTimer <= 0 && this.lossAcc > 0) {
      this.lossTimer = 0.25;
      // Beside the army size label, so it never covers it.
      const side = Math.random() < 0.5 ? -1 : 1;
      this.fx.number(this.pill.x + side * 150, this.pill.y + 40, `-${this.lossAcc}`, 0xff5a5a, 42);
      this.lossAcc = 0;
    }
  }

  /** A whole group wiped out: how many, in a huge number crashing onto the screen where it died. */
  private killSlam(h: SimHorde, atLine: boolean): void {
    const bw = this.bw;
    const world = bw.world;
    const x = (h.x0 + h.x1) / 2;
    const z = -h.z;
    bw.fx.shock(x, z, 260 + Math.min(240, h.count0 * 2), 0xffc050, 0.35);
    bw.fx.sparks(x, 30, z, 14, 0xffd080, 520, 0.6);
    bw.fx.glow(x, 40, z, 260, 0xffb040, 0.2, 0.6);
    world.shake(atLine ? 0.3 : 0.22);
    world.punch(2.5);
    this.hitStop = Math.max(this.hitStop, 45);
    audio.play('smash', 0.8);
    vibrate(30);
    if (!world.project(x, 60, z, this.sp)) return;
    // Above the army's own numbers, below the top bar.
    const top = this.insets.top + 230;
    const y = Math.max(top, Math.min(this.sp.y - 40, this.pill.y - 260));
    const size = 104 + Math.min(56, Math.log10(h.count0 + 1) * 26);
    const sx = Math.max(150, Math.min(viewWidth(this.scale) - 150, this.sp.x));
    this.fx.slam(sx, y, formatCount(h.count0), 0xffd24a, size);
    this.fx.popup('w_kill', sx, y + size * 0.62, 1.3, 0xffe9a8);
  }

  private finish(): void {
    const outcome = this.stress ? null : recordBattle(this.sim);
    if (!this.stress) {
      services.analytics.log('stage_end', {
        stage: this.level.id,
        won: this.sim.phase === 'won',
        seconds: Math.round(this.sim.stats.time),
        power: Math.round(this.sim.army.power),
      });
    }
    this.tutorial.hide();
    this.scene.pause();
    this.scene.launch(SceneKeys.Result, {
      stage: this.level.id,
      won: this.sim.phase === 'won',
      power: this.sim.army.power,
      kills: this.sim.stats.zombiesKilled,
      time: this.sim.stats.time,
      outcome,
    });
  }

  // ---------- ?bench=N: raw sprite rendering cost ----------

  private createBench(count: number): void {
    if (count <= 0) return;
    const { width, height } = this.scale;
    this.benchVel = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      const sprite = this.add
        .image(Math.random() * width, Math.random() * height, ATLAS, 'u0')
        .setTint(BENCH_TINTS[i % BENCH_TINTS.length])
        .setDepth(Depth.Fx);
      this.benchSprites.push(sprite);
      const angle = Math.random() * Math.PI * 2;
      const speed = 80 + Math.random() * 160;
      this.benchVel[i * 2] = Math.cos(angle) * speed;
      this.benchVel[i * 2 + 1] = Math.sin(angle) * speed;
    }
  }

  private stepBench(dt: number): void {
    const { width, height } = this.scale;
    const vel = this.benchVel;
    const sprites = this.benchSprites;
    for (let i = 0; i < sprites.length; i++) {
      const s = sprites[i];
      let x = s.x + vel[i * 2] * dt;
      let y = s.y + vel[i * 2 + 1] * dt;
      if (x < 0 || x > width) {
        vel[i * 2] = -vel[i * 2];
        x = Phaser.Math.Clamp(x, 0, width);
      }
      if (y < 0 || y > height) {
        vel[i * 2 + 1] = -vel[i * 2 + 1];
        y = Phaser.Math.Clamp(y, 0, height);
      }
      s.setPosition(x, y);
    }
  }
}
