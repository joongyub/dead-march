import type Phaser from 'phaser';
import type { BattleSim } from '../sim/BattleSim';
import { Barricades3D } from './Barricades3D';
import { Boss3D } from './Boss3D';
import { Crowd3D } from './Crowd3D';
import { Fx3D } from './Fx3D';
import { Gates3D } from './Gates3D';
import { Scenery } from './Scenery';
import { getWorld, type World3D } from './World3D';
import { Zombies3D } from './Zombies3D';

/** Haze colors by part of the campaign: dusk, a cold morning, the burning city, the infected zone. */
const FOG = [0x9a7a80, 0x7a8aa0, 0xa8785e, 0x7a9478];

/**
 * Everything 3D in a battle, built once (models, pools, shaders) and reset for every battle, so
 * starting a battle creates nothing and leaks nothing.
 */
export class BattleWorld {
  readonly fx: Fx3D;
  readonly scenery: Scenery;
  readonly crowd: Crowd3D;
  readonly zombies: Zombies3D;
  readonly gates: Gates3D;
  readonly barricades: Barricades3D;
  readonly boss: Boss3D;

  constructor(readonly world: World3D) {
    const scene = world.scene;
    this.fx = new Fx3D(scene, world.fog);
    this.scenery = new Scenery(scene);
    this.crowd = new Crowd3D(scene, this.fx);
    this.zombies = new Zombies3D(scene, this.fx);
    this.gates = new Gates3D(scene, this.fx);
    this.barricades = new Barricades3D(scene, this.fx);
    this.boss = new Boss3D(scene, this.fx);
  }

  /** Fog (and sky) color for a stage. */
  fogFor(stage: number): number {
    return FOG[Math.min(FOG.length - 1, Math.floor(Math.max(0, stage - 1) / 5))];
  }

  begin(sim: BattleSim, stage: number): void {
    this.fx.clear();
    this.crowd.reset();
    this.zombies.reset();
    this.gates.reset();
    this.barricades.reset();
    this.boss.reset(sim.boss);
    this.scenery.begin(stage);
    this.world.setFogColor(this.fogFor(stage));
    this.world.reset(sim.crowdX, 0);
    this.scenery.update(0);
  }

  /** Moves everything to this frame's battle state (distance and crowd x interpolated). */
  update(dt: number, sim: BattleSim, distance: number, crowdX: number, marching: boolean): void {
    const fx = this.fx;
    fx.begin();
    this.world.follow(dt, crowdX, distance);
    this.scenery.update(distance);
    this.crowd.sync(sim.army.counts, sim.army.power, sim.crowdRadius);
    this.crowd.update(dt, crowdX, -distance, marching);
    this.zombies.update(dt, sim.hordes, distance, crowdX);
    this.gates.update(dt, sim.gates, distance);
    this.barricades.update(dt, sim.barricades, distance);
    this.boss.update(dt);
    fx.end(dt, this.world.camera.position.z + 200);
  }
}

let battleWorld: BattleWorld | null = null;

/** The battle's 3D world, created on first use; null without WebGL2. */
export function getBattleWorld(game: Phaser.Game): BattleWorld | null {
  if (!battleWorld) {
    const world = getWorld(game);
    if (!world) return null;
    battleWorld = new BattleWorld(world);
  }
  return battleWorld;
}

/** Builds the 3D battle and compiles its shaders ahead of the first battle (loading screen). */
export function prepareBattleWorld(game: Phaser.Game): boolean {
  const bw = getBattleWorld(game);
  if (!bw) return false;
  // Three.js changes GL state behind Phaser's back; Phaser re-applies its own afterwards.
  const renderer = game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
  renderer.pipelines.clear();
  bw.world.warmUp();
  renderer.pipelines.rebind();
  return true;
}
