import type Phaser from 'phaser';
import type { BattleWorld } from './BattleWorld';

let instance: BattleWorld | null = null;
let loading: Promise<BattleWorld | null> | null = null;

/**
 * Loads the 3D engine and builds the battle world in the background (it is a separate download, so
 * the title screen shows without waiting for it). Resolves to null on devices without WebGL2.
 */
export function loadBattleWorld(game: Phaser.Game): Promise<BattleWorld | null> {
  loading ??= import('./BattleWorld')
    .then((m) => {
      instance = m.prepareBattleWorld(game) ? m.getBattleWorld(game) : null;
      return instance;
    })
    .catch((error: unknown) => {
      console.error(error);
      return null;
    });
  return loading;
}

/** The battle world once loaded; null before that or without WebGL2. */
export function battleWorld(): BattleWorld | null {
  return instance;
}
