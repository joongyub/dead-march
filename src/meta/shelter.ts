import shelterData from '../data/shelter.json';
import type { BattleModifiers } from '../sim/BattleSim';

/**
 * Shelter rules with no Phaser and no save access, so the game and the play-time simulator
 * (scripts/playtime.ts) share them. Numbers live in src/data/shelter.json (made by npm run gen-shelter).
 */
export type ResourceId = 'food' | 'scrap' | 'fuel';
export type Resources = Record<ResourceId, number>;
export type Cost = Partial<Record<ResourceId, number>>;
export type BuildingId = 'wall' | 'armory' | 'garage' | 'farm' | 'radio';

/** What one level of a building gives. Only the fields that building uses are set. */
export interface BuildingEffect {
  startBonus?: number;
  dpsMultiplier?: number;
  mergeBonus?: number;
  foodPerHour?: number;
  scrapPerHour?: number;
  fuelPerHour?: number;
}

export interface BuildingLevel {
  /** Paid to reach this level (level 1 is free). */
  cost: Cost;
  effect: BuildingEffect;
}

export interface BuildingDef {
  id: BuildingId;
  name: string;
  /** One line on what upgrading does. */
  desc: string;
  /** levels[0] is level 1. */
  levels: BuildingLevel[];
}

export interface ShelterData {
  idleMaxHours: number;
  /** A clock this far behind the last time the game saw is treated as turned back. */
  rollbackToleranceMinutes: number;
  buildings: BuildingDef[];
}

export const SHELTER = shelterData as ShelterData;
export const RESOURCE_IDS: readonly ResourceId[] = ['food', 'scrap', 'fuel'];
export const RESOURCE_NAMES: Record<ResourceId, string> = { food: '식량', scrap: '고철', fuel: '연료' };
export const BUILDING_IDS: readonly BuildingId[] = ['wall', 'armory', 'garage', 'farm', 'radio'];

const byId = new Map<BuildingId, BuildingDef>(SHELTER.buildings.map((b) => [b.id, b]));

export function building(id: BuildingId): BuildingDef {
  const def = byId.get(id);
  if (!def) throw new Error(`Unknown building "${id}"`);
  return def;
}

export function maxLevel(id: BuildingId): number {
  return building(id).levels.length;
}

/** Saved level, 1 when never upgraded. */
export function levelOf(buildings: Record<string, number>, id: BuildingId): number {
  const level = buildings[id] ?? 1;
  return Math.max(1, Math.min(maxLevel(id), Math.floor(level)));
}

export function effectAt(id: BuildingId, level: number): BuildingEffect {
  const levels = building(id).levels;
  return levels[Math.max(1, Math.min(levels.length, level)) - 1].effect;
}

/** Cost of the next level, or null at the top. */
export function nextCost(buildings: Record<string, number>, id: BuildingId): Cost | null {
  const level = levelOf(buildings, id);
  const levels = building(id).levels;
  return level >= levels.length ? null : levels[level].cost;
}

export function canAfford(resources: Resources, cost: Cost): boolean {
  for (const r of RESOURCE_IDS) if ((cost[r] ?? 0) > resources[r]) return false;
  return true;
}

export interface ShelterState {
  buildings: Record<string, number>;
  resources: Resources;
}

/** Pays and raises the building one level. Returns false (and changes nothing) when it cannot. */
export function upgrade(state: ShelterState, id: BuildingId): boolean {
  const cost = nextCost(state.buildings, id);
  if (!cost || !canAfford(state.resources, cost)) return false;
  for (const r of RESOURCE_IDS) state.resources[r] -= cost[r] ?? 0;
  state.buildings[id] = levelOf(state.buildings, id) + 1;
  return true;
}

/** Battle bonuses from the wall, armory and garage. */
export function shelterModifiers(buildings: Record<string, number>): Required<BattleModifiers> {
  return {
    startBonus: effectAt('wall', levelOf(buildings, 'wall')).startBonus ?? 0,
    dpsMultiplier: effectAt('armory', levelOf(buildings, 'armory')).dpsMultiplier ?? 1,
    mergeBonus: effectAt('garage', levelOf(buildings, 'garage')).mergeBonus ?? 0,
  };
}

/** Resources per hour while away: food from the farm, supply crates (scrap, fuel) over the radio. */
export function idleRates(buildings: Record<string, number>): Resources {
  const farm = effectAt('farm', levelOf(buildings, 'farm'));
  const radio = effectAt('radio', levelOf(buildings, 'radio'));
  return { food: farm.foodPerHour ?? 0, scrap: radio.scrapPerHour ?? 0, fuel: radio.fuelPerHour ?? 0 };
}

export interface IdleClock {
  /** When idle resources were last collected (ms since epoch). */
  collectedAt: number;
  /** Latest time the game has seen; never moves backwards. */
  lastSeen: number;
}

const HOUR = 3_600_000;

/**
 * Applies the clock-rollback guard: if the device clock is now well behind the latest time the game
 * saw, the pile restarts from that latest time, so turning the clock forward to collect and back again
 * earns nothing until real time catches up. Returns true when a rollback was caught.
 */
export function guardClock(clock: IdleClock, now: number): boolean {
  const rolledBack = now < clock.lastSeen - SHELTER.rollbackToleranceMinutes * 60_000;
  if (rolledBack) clock.collectedAt = Math.max(clock.collectedAt, clock.lastSeen);
  clock.lastSeen = Math.max(clock.lastSeen, now);
  return rolledBack;
}

/** Hours of idle time waiting to be collected, capped at idleMaxHours. */
export function idleHours(clock: IdleClock, now: number): number {
  return Math.max(0, Math.min(SHELTER.idleMaxHours, (now - clock.collectedAt) / HOUR));
}

export function idlePending(buildings: Record<string, number>, clock: IdleClock, now: number): Resources {
  const hours = idleHours(clock, now);
  const rates = idleRates(buildings);
  return {
    food: Math.floor(rates.food * hours),
    scrap: Math.floor(rates.scrap * hours),
    fuel: Math.floor(rates.fuel * hours),
  };
}

/** Moves the waiting idle resources into the stockpile. */
export function collectIdle(state: ShelterState & { idle: IdleClock }, now: number): Resources {
  guardClock(state.idle, now);
  const got = idlePending(state.buildings, state.idle, now);
  for (const r of RESOURCE_IDS) state.resources[r] += got[r];
  state.idle.collectedAt = Math.max(state.idle.collectedAt, now);
  return got;
}
