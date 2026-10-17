import type Phaser from 'phaser';
import type { BattleSim } from '../sim/BattleSim';
import { Barricades3D } from './Barricades3D';
import { Boss3D } from './Boss3D';
import { Crowd3D } from './Crowd3D';
import { Fx3D } from './Fx3D';
import { Gates3D } from './Gates3D';
import { Scenery } from './Scenery';
import { Shells3D } from './Shells3D';
import { BATTLE_VIEW, createWorld, type CameraView, type World3D } from './World3D';
import { Zombies3D } from './Zombies3D';

/** Haze colors by part of the campaign: dusk, a cold morning, the burning city, the infected zone. */
const FOG = [0x9a7a80, 0x7a8aa0, 0xa8785e, 0x7a9478];
/** Lobby: low behind the army, looking up the street at the burning skyline. */
const PARADE_VIEW: CameraView = { back: 380, up: 310, ahead: 1100, lookY: 160, hFov: 44, followX: 0 };
const PARADE_SPEED = 90;

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
  readonly shells: Shells3D;
  private paradeDistance = 0;
  private nextBoom = 0;

  constructor(readonly world: World3D) {
    const scene = world.scene;
    this.fx = new Fx3D(scene, world.fog);
    this.scenery = new Scenery(scene);
    this.crowd = new Crowd3D(scene, this.fx);
    this.zombies = new Zombies3D(scene, this.fx);
    this.gates = new Gates3D(scene, this.fx);
    this.barricades = new Barricades3D(scene, this.fx);
    this.boss = new Boss3D(scene, this.fx);
    this.shells = new Shells3D(this.fx, this.zombies, world);
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
    this.shells.reset();
    this.scenery.begin(stage);
    this.world.setFogColor(this.fogFor(stage));
    this.world.setView(BATTLE_VIEW);
    this.world.reset(sim.crowdX, 0);
    this.scenery.update(0);
  }

  /** Lobby backdrop: the army marching up this stage's street, seen from low behind it. */
  beginParade(stage: number, counts: readonly number[]): void {
    this.fx.clear();
    this.crowd.reset();
    this.zombies.reset();
    this.gates.reset();
    this.barricades.reset();
    this.boss.clear();
    this.shells.reset();
    this.paradeDistance = 0;
    this.nextBoom = 2;
    this.world.setView(PARADE_VIEW);
    this.world.reset(360, 0);
    this.paradeStage(stage);
    let units = 0;
    for (const n of counts) units += n;
    // Same circle the battle gives an army this size.
    this.crowd.sync(counts, units, Math.min(150, 34 + 6.5 * Math.sqrt(Math.min(units, 120))));
  }

  /** The street and haze of another stage (the player browsing stages). */
  paradeStage(stage: number): void {
    this.scenery.begin(stage);
    this.scenery.update(this.paradeDistance);
    this.world.setFogColor(this.fogFor(stage));
  }

  updateParade(dt: number): void {
    const d = (this.paradeDistance += PARADE_SPEED * dt);
    const fx = this.fx;
    fx.begin();
    this.world.follow(dt, 360, d);
    this.scenery.update(d);
    this.crowd.update(dt, 360, -d, true);
    // Now and then something blows up far down the street.
    this.nextBoom -= dt;
    if (this.nextBoom <= 0) {
      this.nextBoom = 2.5 + Math.random() * 3;
      const side = Math.random() < 0.5 ? -1 : 1;
      fx.explosion(360 + side * (120 + Math.random() * 260), 0, -d - 1300 - Math.random() * 900, 1.4);
      this.world.shake(0.06);
    }
    fx.end(dt, this.world.camera.position.z + 200);
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
    this.shells.update(dt);
    fx.end(dt, this.world.camera.position.z + 200);
  }
}

let battleWorld: BattleWorld | null = null;

/** The battle's 3D world, created on first use; null without WebGL2. */
export function getBattleWorld(game: Phaser.Game): BattleWorld | null {
  if (!battleWorld) {
    const world = createWorld(game);
    if (!world) return null;
    battleWorld = new BattleWorld(world);
  }
  return battleWorld;
}
