import Phaser from 'phaser';
import { viewWidth } from '../core/quality';
import { save } from '../game/save';
import { t } from '../i18n';
import { services } from '../services';
import { greedySide } from '../sim/agent';
import type { BattleSim, SimEvent, SimGate } from '../sim/BattleSim';
import { Coach } from '../ui/Coach';
import { Depth } from './depth';

type Step = 'swipe' | 'gate' | 'merge';

/** Screen positions of things in the 3D battle, in game units. */
export interface BattleScreen {
  /** The army's feet. */
  crowd: { x: number; y: number };
  /** Bottom middle of one side of a gate; false if it is off screen. */
  gate(g: SimGate, side: number, out: { x: number; y: number }): boolean;
}

/** Finger movement needed before the swipe lesson counts as learned. */
const SWIPE_DISTANCE = 220;
/** The gate lesson starts when the first gate is this close. */
const GATE_LOOKAHEAD = 760;
const MERGE_SECONDS = 2.6;

/**
 * Stage 1 lessons, one line of text and a pointing finger each: steer by dragging, take the better
 * gate, and what a merge is. The battle slows down while a lesson is on screen. Each lesson is stored
 * in the save once learned and never shown again.
 */
export class BattleTutorial {
  private readonly coach: Coach;
  private step: Step | null = null;
  private dragged = 0;
  private mergeTimer = 0;
  private gate: SimGate | null = null;
  private gateSide = 0;
  private readonly enabled: boolean;
  private readonly point = { x: 0, y: 0 };

  constructor(
    private readonly scene: Phaser.Scene,
    stage: number,
  ) {
    const tut = save.data.tutorial;
    this.enabled = stage === 1 && !(tut.swipe && tut.gate && tut.merge);
    this.coach = new Coach(scene, Depth.HudText + 1);
    if (this.enabled && !tut.swipe) this.show('swipe');
  }

  /** How fast the battle runs while a lesson is up (1 = normal). */
  get timeScale(): number {
    if (this.step === 'gate') return 0.35;
    if (this.step === 'merge') return 0.5;
    return 1;
  }

  onDrag(dx: number): void {
    if (this.step !== 'swipe') return;
    this.dragged += Math.abs(dx);
    if (this.dragged >= SWIPE_DISTANCE) this.learn('swipe');
  }

  onEvent(e: SimEvent): void {
    if (!this.enabled) return;
    if (e.type === 'gate') {
      if (this.step === 'swipe') this.learn('swipe');
      if (this.step === 'gate' && e.gate === this.gate) this.learn('gate');
    } else if (e.type === 'merge' && !save.data.tutorial.merge && this.step === null) {
      this.mergeTimer = MERGE_SECONDS;
      this.show('merge');
    }
  }

  update(dt: number, sim: BattleSim, screen: BattleScreen, mergeIcon: Phaser.GameObjects.Image): void {
    if (!this.enabled) return;
    this.coach.tick(dt);
    if (this.step === null && !save.data.tutorial.gate) {
      const next = this.nextGate(sim);
      if (next && next.z - sim.distance < GATE_LOOKAHEAD) {
        this.gate = next;
        this.gateSide = greedySide(sim, next);
        this.show('gate');
      }
    }
    const width = viewWidth(this.scene.scale);
    switch (this.step) {
      case 'swipe':
        this.coach.sweepAt(screen.crowd.x, screen.crowd.y + 110, 130);
        this.coach.textAt(width / 2, screen.crowd.y - 330);
        break;
      case 'gate': {
        const g = this.gate!;
        if (screen.gate(g, this.gateSide, this.point)) {
          this.coach.pointAt(this.point.x, this.point.y + 30);
          this.coach.textAt(width / 2, Math.max(this.point.y - 200, 260));
        }
        if (g.passed) this.learn('gate');
        break;
      }
      case 'merge':
        this.coach.pointAt(mergeIcon.x, mergeIcon.y + 24);
        this.coach.textAt(width / 2, mergeIcon.y + 170);
        this.mergeTimer -= dt;
        if (this.mergeTimer <= 0) this.learn('merge');
        break;
    }
  }

  /** Takes the lesson off screen (the battle is over). */
  hide(): void {
    this.step = null;
    this.coach.hide();
  }

  private nextGate(sim: BattleSim): SimGate | null {
    let best: SimGate | null = null;
    for (const g of sim.gates) if (!g.passed && (!best || g.z < best.z)) best = g;
    return best;
  }

  private show(step: Step): void {
    this.step = step;
    const key = step === 'swipe' ? 'tut.swipe' : step === 'gate' ? 'tut.gate' : 'tut.merge';
    this.coach.show(t(key));
  }

  private learn(step: Step): void {
    save.data.tutorial[step] = true;
    save.commit();
    services.analytics.log('tutorial_step', { step });
    if (this.step === step) {
      this.step = null;
      this.coach.hide();
    }
  }
}
