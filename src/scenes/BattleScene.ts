import Phaser from 'phaser';
import { ATLAS } from '../art/atlas';
import { audio } from '../audio/Audio';
import { BarricadeView } from '../battle/BarricadeView';
import { BossView } from '../battle/BossView';
import { CrowdView } from '../battle/CrowdView';
import { Depth } from '../battle/depth';
import { Effects } from '../battle/Effects';
import { GateView } from '../battle/GateView';
import { HordeView } from '../battle/HordeView';
import { Hud } from '../battle/Hud';
import { stressLevel } from '../battle/stressLevel';
import { Track } from '../battle/Track';
import { BattleTutorial } from '../battle/Tutorial';
import { Colors, DESIGN_WIDTH, FONT_FAMILY, SceneKeys } from '../config';
import { setFrameCap } from '../core/frameRate';
import { FixedTimestep } from '../core/FixedTimestep';
import { lowSpecWanted, quality, setLowSpec, SlowFrameDetector, viewHeight, viewWidth } from '../core/quality';
import { recordBattle } from '../game/progress';
import { stageName, t, zombieName } from '../i18n';
import { shelterModifiers } from '../meta/shelter';
import { save } from '../game/save';
import { flags } from '../platform/flags';
import { vibrate } from '../platform/haptics';
import { BattleSim, type BattleModifiers } from '../sim/BattleSim';
import { getLevel, RULES } from '../sim/rules';
import { ROAD_CENTER, ROAD_LEFT, ROAD_RIGHT, type LevelData } from '../sim/types';
import { BaseScene } from './BaseScene';

export interface BattleData {
  stage?: number;
  stress?: boolean;
  modifiers?: BattleModifiers;
}

/** Finger movement → crowd movement. A little above 1 so a thumb can cross the road without lifting. */
const DRAG_GAIN = 1.25;
const TRACER_TINTS = [0xfff2c0, 0xffe27a, 0xffb24a, 0xff8a3a];
const TIER_RANGES = RULES.tiers.map((t) => t.range);
const BENCH_TINTS = [0x5fb3ff, 0x6fd16f, 0xffd166, 0xc77dff];

/**
 * The runner battle. Rules live in BattleSim (stepped at a fixed 60 Hz); this scene only feeds it the
 * finger position and draws its state, interpolated to the screen's refresh rate.
 */
export class BattleScene extends BaseScene {
  private readonly timestep = new FixedTimestep();
  private sim!: BattleSim;
  private level!: LevelData;
  private stress = false;

  private track!: Track;
  private crowd!: CrowdView;
  private hordes!: HordeView;
  private gates!: GateView;
  private barricades!: BarricadeView;
  private boss!: BossView;
  private fx!: Effects;
  private hud!: Hud;
  private tutorial!: BattleTutorial;
  /** White full-screen flash (boss kill). */
  private flash!: Phaser.GameObjects.Image;

  private roadX = 0;
  private crowdY = 0;
  private viewAhead = 0;
  private viewBottom = 0;

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
  private powerSeen = 0;
  private meleeLoss = 0;
  private meleeTimer = 0;
  private lastMergePopup = 0;
  private readonly point = { x: 0, y: 0 };
  private readonly slowFrames = new SlowFrameDetector();
  private readonly stepFn = (dt: number) => this.step(dt);

  private benchSprites: Phaser.GameObjects.Image[] = [];
  private benchVel = new Float32Array(0);

  constructor() {
    super(SceneKeys.Battle);
  }

  create(data: BattleData): void {
    setFrameCap(this.game, 0);
    this.stress = data.stress ?? flags.stress;
    this.level = this.stress ? stressLevel() : getLevel(data.stage ?? save.data.unlocked);
    // The stress test measures raw cost, so it ignores shelter upgrades.
    const modifiers = data.modifiers ?? (this.stress ? undefined : shelterModifiers(save.data.buildings));
    this.sim = new BattleSim(this.level, RULES, modifiers);
    this.timestep.reset();
    this.prevDistance = 0;
    this.prevCrowdX = this.sim.crowdX;
    this.targetX = this.sim.crowdX;
    this.dragging = false;
    this.hitStop = 0;
    this.slowMo = 0;
    this.endTimer = -1;
    this.ended = false;
    this.shotAcc = 0;
    this.powerSeen = this.sim.army.power;
    this.meleeLoss = 0;
    this.meleeTimer = 0;
    this.slowFrames.reset();

    this.track = new Track(this, this.level.id);
    this.fx = new Effects(this, Depth.Decals, Depth.Fx, Depth.FxAdd, Depth.Labels);
    this.fx.density = quality.particleScale;
    this.gates = new GateView(this);
    this.barricades = new BarricadeView(this);
    this.hordes = new HordeView(this);
    this.boss = new BossView(this, this.sim.boss);
    this.crowd = new CrowdView(this);
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

    this.cameras.main.setBackgroundColor(Colors.background);
    this.enter();
    this.bindLayout();
    // Expose for automated checks (?debug=1 only).
    if (flags.debug) Object.assign(window, { __battle: this });
  }

  /** Stage being played (0 = stress test); the pause menu's retry uses it. */
  get stageId(): number {
    return this.level.id;
  }

  /** Read by the debug overlay and the smoke test. */
  get debugInfo(): { units: number; zombies: number; fx: number; power: number; phase: string; distance: number } {
    return {
      units: this.crowd.count,
      zombies: this.hordes.spriteCount,
      fx: this.fx.activeCount,
      power: this.sim.army.power,
      phase: this.sim.phase,
      distance: Math.round(this.sim.distance),
    };
  }

  override update(_time: number, delta: number): void {
    let simDelta = delta;
    let fxScale = 1;
    if (this.hitStop > 0) {
      this.hitStop -= delta;
      simDelta = 0;
      fxScale = 0.25;
    } else if (this.slowMo > 0) {
      this.slowMo -= delta;
      simDelta = delta * 0.3;
      fxScale = 0.45;
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
    const distance = this.prevDistance + (this.sim.distance - this.prevDistance) * alpha;
    const crowdX = this.prevCrowdX + (this.sim.crowdX - this.prevCrowdX) * alpha;
    this.render((delta / 1000) * fxScale, distance, crowdX);

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
    this.fx.density = quality.particleScale;
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
    this.roadX = (width - DESIGN_WIDTH) / 2;
    this.crowdY = Math.round(height * 0.74);
    this.viewAhead = this.crowdY + 60;
    this.viewBottom = height;
    this.track.layout(width, height, this.roadX);
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
    const cx = this.roadX + sim.crowdX;
    const cy = this.crowdY;
    // Above the army size label, which sits just above the crowd.
    const numberY = cy - sim.crowdRadius - 150;
    const wordY = cy - sim.crowdRadius - 240;
    for (const e of sim.events) {
      this.tutorial.onEvent(e);
      switch (e.type) {
        case 'gate': {
          const delta = sim.army.power - e.powerBefore;
          const op = e.side === 0 ? e.gate.left : e.gate.right;
          if (op.kind === 'merge' || op.kind === 'split') {
            fx.popup(op.kind === 'merge' ? 'w_merge' : 'w_split', cx, wordY, 0.8, 0xffd27a);
          }
          if (delta !== 0) {
            fx.number(cx, numberY, `${delta > 0 ? '+' : ''}${delta}`, delta > 0 ? 0x7fe3ff : 0xff6b6b, 54);
          }
          fx.ring(cx, cy, 320, delta >= 0 ? 0x6fc8ff : 0xff5050, 0.3);
          audio.play(delta >= 0 ? 'gateGood' : 'gateBad');
          this.powerSeen = sim.army.power;
          vibrate(delta >= 0 ? 15 : 40);
          break;
        }
        case 'merge': {
          audio.play('merge', 1, e.tier * 200);
          fx.ring(cx, cy - 20, 300, 0xfff1a8, 0.3);
          fx.glow(cx, cy - 20, 150, 0xfff1a8, 0.2);
          const now = this.time.now;
          if (now - this.lastMergePopup > 700) {
            this.lastMergePopup = now;
            fx.popup('w_merge', cx, wordY, 0.75, e.tier === 3 ? 0xffd27a : 0xffffff);
          }
          if (e.tier === 3) {
            this.shake(140, 0.006);
            vibrate(30);
          }
          break;
        }
        case 'clash':
          audio.play('clash');
          this.hitStop = 45;
          this.shake(110, 0.005);
          vibrate(25);
          break;
        case 'hordeCleared':
          if (e.byMelee) this.shake(80, 0.003);
          break;
        case 'barricadeSmashed':
          audio.play('smash');
          this.hitStop = 50;
          this.shake(180, 0.01);
          fx.popup('w_smash', cx, wordY, 0.8, 0xffd27a);
          vibrate(50);
          break;
        case 'barricadeBroken':
          audio.play('smash', 0.6);
          this.shake(90, 0.004);
          break;
        case 'bossStart':
          audio.play('bossRoar');
          fx.popup('w_boss', viewWidth(this.scale) / 2, viewHeight(this.scale) * 0.36, 1.4, 0xff7070);
          this.hud.showBoss();
          this.shake(220, 0.006);
          vibrate(60);
          break;
        case 'won':
          audio.play('explode');
          audio.play('win');
          audio.stopMusic();
          this.flash.setAlpha(0.8);
          this.slowMo = 900;
          this.shake(400, 0.012);
          this.endTimer = 1500;
          this.ended = true;
          vibrate(120);
          break;
        case 'lost':
          audio.play('lose');
          audio.stopMusic();
          this.crowd.wipe(fx, this.roadX, sim.distance);
          this.shake(300, 0.01);
          this.endTimer = 1100;
          this.ended = true;
          vibrate(200);
          break;
      }
    }
    sim.events.length = 0;
  }

  private shake(ms: number, intensity: number): void {
    if (save.data.settings.shake) this.cameras.main.shake(ms, intensity);
  }

  // ---------- drawing ----------

  private render(dt: number, distance: number, crowdX: number): void {
    const sim = this.sim;
    const roadX = this.roadX;
    const crowdY = this.crowdY;
    const cx = roadX + crowdX;
    this.track.update(distance, roadX, crowdY);
    this.crowd.sync(sim.army.counts, sim.army.power, sim.crowdRadius, this.fx, roadX, distance);
    this.crowd.update(dt, cx, crowdY, sim.phase === 'run' && sim.speed > 60);
    this.hordes.update(dt, sim.hordes, distance, roadX, crowdY, this.viewAhead, this.viewBottom, this.fx);
    this.gates.update(dt, sim.gates, distance, roadX, crowdY, this.viewAhead, this.viewBottom);
    this.barricades.update(dt, sim.barricades, distance, roadX, crowdY, this.viewAhead, this.viewBottom, this.fx);
    this.boss.update(dt, distance, roadX, ROAD_CENTER, crowdY, this.fx);
    if (this.boss.landed) {
      audio.play('clash', 0.8);
      this.crowd.hitFront();
      this.fx.burst(cx, crowdY - sim.crowdRadius * 0.6, 6, 0xd02030, 320, 'chunk', 0.4);
      this.shake(120, 0.007);
      vibrate(35);
    }
    this.updateShooting(dt, distance);
    this.updateLosses(dt, cx);
    this.fx.update(dt, roadX, crowdY, distance, this.viewBottom);
    this.hud.update(dt, sim, cx, crowdY);
    if (this.flash.alpha > 0) this.flash.setAlpha(Math.max(0, this.flash.alpha - dt * 2.5));
    this.tutorial.update(dt, sim, roadX, crowdY, this.hud.tierIconAt(1));
  }

  /** Tracers from random front units to the current target; the rate grows with the crowd but is capped. */
  private updateShooting(dt: number, distance: number): void {
    const sim = this.sim;
    if (sim.firePower <= 0 || sim.finished) return;
    const rate = Math.min(34, 5 + this.crowd.count * 0.45) * quality.particleScale;
    this.shotAcc += dt * rate;
    while (this.shotAcc >= 1) {
      this.shotAcc -= 1;
      let tz: number;
      if (sim.targetKind === 'horde' && sim.targetHorde) {
        if (!this.hordes.targetPoint(sim.targetHorde, this.point)) continue;
        tz = sim.targetHorde.z;
      } else if (sim.targetKind === 'barricade' && sim.targetBarricade) {
        const b = sim.targetBarricade;
        this.point.x = this.roadX + b.x0 + Math.random() * (b.x1 - b.x0);
        this.point.y = this.crowdY - (b.z - distance);
        tz = b.z;
      } else if (sim.targetKind === 'boss' && this.boss.visible) {
        this.point.x = this.boss.targetX();
        this.point.y = this.boss.targetY();
        tz = sim.boss.z;
      } else {
        continue;
      }
      const shooter = this.crowd.pickShooter(tz - distance, TIER_RANGES);
      if (shooter < 0) continue;
      const tier = this.crowd.shooterTier(shooter);
      const sx = this.crowd.shooterX(shooter);
      const sy = this.crowd.shooterY(shooter);
      this.fx.tracer(sx, sy, this.point.x, this.point.y, TRACER_TINTS[tier]);
      audio.play(tier === 3 ? 'cannon' : tier === 2 ? 'shotHeavy' : 'shot');
      if (sim.targetKind === 'horde' && Math.random() < 0.35) this.hordes.flashRandom(sim.targetHorde!);
      else if (sim.targetKind === 'boss' && Math.random() < 0.15) audio.play('bossHit');
      if (tier >= 2 || Math.random() < 0.3) this.fx.glow(sx, sy - 8, 34 + tier * 14, 0xffe08a, 0.06);
      if (tier === 3) this.fx.glow(this.point.x, this.point.y, 120, 0xffa040, 0.16);
      else if (Math.random() < 0.25) this.fx.burst(this.point.x, this.point.y, 1, 0xfff0b0, 160, 'spark', 0.2);
    }
  }

  /** Army lost to melee, barricades and the boss shows up as red numbers every quarter second. */
  private updateLosses(dt: number, cx: number): void {
    const power = this.sim.army.power;
    if (power < this.powerSeen) {
      this.meleeLoss += this.powerSeen - power;
      this.crowd.hitFront();
    }
    this.powerSeen = power;
    this.meleeTimer -= dt;
    if (this.meleeTimer <= 0 && this.meleeLoss > 0) {
      this.meleeTimer = 0.25;
      // Beside the crowd, so it never covers the army size label above it.
      const side = Math.random() < 0.5 ? -1 : 1;
      this.fx.number(cx + side * (this.sim.crowdRadius + 50), this.crowdY - 20, `-${this.meleeLoss}`, 0xff5a5a, 38);
      this.meleeLoss = 0;
    }
  }

  private finish(): void {
    const outcome = this.stress ? null : recordBattle(this.sim);
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
