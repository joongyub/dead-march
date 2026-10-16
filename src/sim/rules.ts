import levelsJson from '../data/levels.json';
import unitsJson from '../data/units.json';
import zombiesJson from '../data/zombies.json';
import type { BattleRules } from './BattleSim';
import type { LevelData, TierDef } from './types';

export const RULES: BattleRules = {
  tiers: unitsJson.tiers as TierDef[],
  zombies: zombiesJson.kinds,
  bosses: zombiesJson.bosses,
};

export const LEVELS: readonly LevelData[] = levelsJson.levels as LevelData[];

export function getLevel(id: number): LevelData {
  return LEVELS.find((l) => l.id === id) ?? LEVELS[LEVELS.length - 1];
}
