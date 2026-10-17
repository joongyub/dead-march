import type Phaser from 'phaser';
import type { BattleWorld } from './BattleWorld';
import type { ShelterWorld } from './ShelterWorld';

let battle: BattleWorld | null = null;
let shelter: ShelterWorld | null = null;
let loading: Promise<boolean> | null = null;

/**
 * Loads the 3D engine and builds the battle and shelter worlds in the background (it is a separate
 * download, so the title screen shows without waiting for it). Resolves to false on devices without
 * WebGL2.
 */
export function load3D(game: Phaser.Game): Promise<boolean> {
  loading ??= Promise.all([import('./BattleWorld'), import('./ShelterWorld')])
    .then(([b, s]) => {
      battle = b.getBattleWorld(game);
      shelter = s.getShelterWorld(game);
      if (!battle || !shelter) return false;
      // Compile every shader now (Three.js changes GL state behind Phaser's back; Phaser re-applies its own).
      const renderer = game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
      renderer.pipelines.clear();
      battle.world.warmUp();
      shelter.world.warmUp();
      renderer.pipelines.rebind();
      return true;
    })
    .catch((error: unknown) => {
      console.error(error);
      battle = null;
      shelter = null;
      return false;
    });
  return loading;
}

/** The battle world once loaded; null before that or without WebGL2. */
export function battleWorld(): BattleWorld | null {
  return battle;
}

/** The shelter yard once loaded; null before that or without WebGL2. */
export function shelterWorld(): ShelterWorld | null {
  return shelter;
}
