import economy from '../data/economy.json';
import type { BattleSim } from '../sim/BattleSim';
import { LEVELS } from '../sim/rules';
import type { LevelData } from '../sim/types';
import { save, type ResourceId } from './save';

export type Reward = Record<ResourceId, number>;

const E = economy.battle;

/**
 * What a battle pays. Clearing pays the stage's scrap plus food (more when more of the army survived)
 * and fuel (mostly from boss stages). Replays pay less; a defeat pays a share by how far the crowd got.
 */
export function battleReward(level: LevelData, won: boolean, powerLeft: number, progress: number, replay: boolean): Reward {
  const n = level.id;
  const scale = won ? (replay ? E.replayShare : 1) : E.lossShare * Math.max(0, Math.min(1, progress));
  const food = E.foodBase + n * E.foodPerStage + (won ? Math.min(E.foodMaxFromPower, powerLeft * E.foodPerPowerLeft) : 0);
  const fuel = (n % 5 === 0 ? E.fuelBossStage : 0) + n * E.fuelPerStage;
  return {
    scrap: Math.floor(level.reward * scale),
    food: Math.floor(food * scale),
    fuel: won ? Math.floor(fuel * scale) : 0,
  };
}

export interface BattleOutcome {
  won: boolean;
  reward: Reward;
  /** Stage the "next" button should start. */
  nextStage: number;
  firstClear: boolean;
}

/** Records a finished battle in the save and returns what the player earned. */
export function recordBattle(sim: BattleSim): BattleOutcome {
  const level = sim.level;
  const won = sim.phase === 'won';
  const data = save.data;
  const replay = data.best[level.id] !== undefined;
  const progress = sim.phase === 'won' ? 1 : Math.min(1, sim.distance / level.length) * 0.85 + (sim.phase === 'boss' ? 0.15 * (1 - sim.boss.hp / sim.boss.hp0) : 0);
  const reward = battleReward(level, won, sim.army.power, progress, replay);
  if (level.id > 0) {
    data.resources.scrap += reward.scrap;
    data.resources.food += reward.food;
    data.resources.fuel += reward.fuel;
    data.stats.battles++;
    data.stats.zombies += sim.stats.zombiesKilled;
    if (won) {
      data.stats.wins++;
      data.best[level.id] = Math.max(data.best[level.id] ?? 0, sim.army.power);
      data.unlocked = Math.max(data.unlocked, Math.min(LEVELS.length, level.id + 1));
    }
    save.commit();
  }
  const nextStage = won ? Math.min(LEVELS.length, level.id + 1) : level.id;
  return { won, reward, nextStage, firstClear: won && !replay };
}
