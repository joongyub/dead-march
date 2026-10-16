/**
 * Battle rules data. Everything here is plain data with no Phaser dependency, so the same rules run
 * in the game, in the balance simulator (Node) and in tests.
 */

export const TIER_COUNT = 4;
export type Tier = 0 | 1 | 2 | 3;

export interface TierDef {
  id: string;
  name: string;
  /** Survivor-equivalents one unit is worth. Merging never changes total power. */
  power: number;
  /** Zombie hit points removed per second by one unit. */
  dps: number;
  /** How far ahead (track units) this unit can shoot. */
  range: number;
  /** How many of this tier merge into one of the next. */
  mergeCost?: number;
  /** Merging only consumes units above this many, so the crowd keeps some of every tier. */
  mergeKeep?: number;
  breaksBarricades?: boolean;
  /** Share of this tier's damage that passes through the target into the next zombie group behind it. */
  pierce?: number;
}

export interface ZombieKind {
  name: string;
  hp: number;
  /** Survivor-equivalents a zombie of this kind kills in melee. */
  power: number;
  /** Track units per second toward the crowd once aggroed. */
  speed: number;
  aggroRange: number;
  /** Extra power lost when this zombie dies in melee. */
  blast?: number;
}

export interface BossKind {
  name: string;
  speed: number;
  radius: number;
}

/**
 * Gate operation as written in level data: "+20", "-10", "x2", "/2", "+3 soldier", "+1 tank",
 * "merge" (every unit evolves one tier now) or "split" (higher units break down one tier, 1.5 times as many).
 */
export type GateOpText = string;

export interface GateEvent {
  type: 'gate';
  z: number;
  left: GateOpText;
  right: GateOpText;
}

export interface HordeEvent {
  type: 'horde';
  z: number;
  kind: string;
  count: number;
  /** Center across the road, 0 = left edge, 1 = right edge. Default 0.5. */
  x?: number;
  /** Width as a fraction of the road. Default 1 (cannot be avoided). */
  w?: number;
}

export interface BarricadeEvent {
  type: 'barricade';
  z: number;
  hp: number;
  x?: number;
  w?: number;
}

export type LevelEvent = GateEvent | HordeEvent | BarricadeEvent;

export interface LevelData {
  id: number;
  name: string;
  /** Track length before the boss arena. */
  length: number;
  speed?: number;
  start: number;
  events: LevelEvent[];
  boss: { kind: string; hp: number; dps: number };
  /** Base scrap reward for clearing. */
  reward: number;
  /** What this stage introduces, shown on the stage card. */
  intro?: string;
}

export interface ParsedOp {
  kind: 'add' | 'sub' | 'mul' | 'div' | 'merge' | 'split';
  value: number;
  tier: Tier;
}

export const ROAD_LEFT = 60;
export const ROAD_RIGHT = 660;
export const ROAD_WIDTH = ROAD_RIGHT - ROAD_LEFT;
export const ROAD_CENTER = (ROAD_LEFT + ROAD_RIGHT) / 2;
