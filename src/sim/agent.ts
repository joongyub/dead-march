import { Army } from './Army';
import { BattleSim, type BattleModifiers, type BattleRules, type SimGate } from './BattleSim';
import { ROAD_CENTER, ROAD_LEFT, ROAD_RIGHT, type LevelData } from './types';

const LOOKAHEAD = 900;
const STEP = 1 / 60;
const LEFT_X = ROAD_LEFT + (ROAD_CENTER - ROAD_LEFT) / 2;
const RIGHT_X = ROAD_CENTER + (ROAD_RIGHT - ROAD_CENTER) / 2;

export interface AgentPlan {
  /** Side per gate in track order: 0 = left, 1 = right; 'greedy' takes whichever makes the army stronger now. */
  gates: number[] | 'greedy';
  /** With 'greedy': gate indices where the player picks the worse side (a casual player's mistakes). */
  mistakes?: boolean[];
  /** Steer around avoidable hordes/barricades (true) or plough straight through (false). */
  dodge: boolean;
}

export interface RunResult {
  won: boolean;
  power: number;
  peakPower: number;
  damageTaken: number;
  time: number;
  bossHpLeft: number;
}

/**
 * A scripted player for the balance simulator: picks gate sides from a plan and optionally dodges
 * partial-width obstacles. Uses the same BattleSim the game uses.
 */
export function runPlan(
  level: LevelData,
  rules: BattleRules,
  plan: AgentPlan,
  modifiers?: BattleModifiers,
  maxTime = 240,
): RunResult {
  const sim = new BattleSim(level, rules, modifiers);
  const gates = [...sim.gates].sort((a, b) => a.z - b.z);
  while (!sim.finished && sim.stats.time < maxTime) {
    sim.setTargetX(chooseX(sim, gates, plan));
    sim.step(STEP);
    sim.events.length = 0;
  }
  return {
    won: sim.phase === 'won',
    power: sim.army.power,
    peakPower: sim.stats.peakPower,
    damageTaken: sim.stats.damageTaken,
    time: sim.stats.time,
    bossHpLeft: sim.boss.hp,
  };
}

export function chooseX(sim: BattleSim, gates: BattleSim['gates'], plan: AgentPlan): number {
  const d = sim.distance;
  for (let i = 0; i < gates.length; i++) {
    const g = gates[i];
    if (g.passed) continue;
    if (g.z - d < LOOKAHEAD) {
      let side = plan.gates === 'greedy' ? greedySide(sim, g) : plan.gates[i];
      if (plan.gates === 'greedy' && plan.mistakes?.[i]) side = 1 - side;
      return side === 0 ? LEFT_X : RIGHT_X;
    }
    break;
  }
  if (!plan.dodge) return sim.crowdX;
  // Steer toward the widest free gap next to the nearest partial obstacle ahead.
  let nearest: [number, number] | null = null;
  let nearestZ = Infinity;
  for (const h of sim.hordes) {
    if (h.active && h.z > d && h.z - d < LOOKAHEAD && h.z < nearestZ && h.x1 - h.x0 < ROAD_RIGHT - ROAD_LEFT - 1) {
      nearest = [h.x0, h.x1];
      nearestZ = h.z;
    }
  }
  for (const b of sim.barricades) {
    if (b.active && b.z > d && b.z - d < LOOKAHEAD && b.z < nearestZ && b.x1 - b.x0 < ROAD_RIGHT - ROAD_LEFT - 1) {
      nearest = [b.x0, b.x1];
      nearestZ = b.z;
    }
  }
  if (!nearest) return sim.crowdX;
  const leftGap = nearest[0] - ROAD_LEFT;
  const rightGap = ROAD_RIGHT - nearest[1];
  return leftGap > rightGap ? ROAD_LEFT + leftGap / 2 : nearest[1] + rightGap / 2;
}

/**
 * How a sensible player values an army: its power, plus a bonus for firepower, because higher tiers shoot
 * harder per survivor-equivalent. This is what makes a merge gate worth taking over a small "+N".
 */
export function armyStrength(army: Army): number {
  return army.power + 3 * army.dpsAt(0);
}

function greedySide(sim: BattleSim, gate: SimGate): number {
  const tryOp = (op: SimGate['left']) => {
    const army = new Army(sim.rules.tiers);
    for (let i = 0; i < army.counts.length; i++) army.counts[i] = sim.army.counts[i];
    army.apply(op);
    return armyStrength(army);
  };
  return tryOp(gate.left) >= tryOp(gate.right) ? 0 : 1;
}

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Share of casual players that clear the stage: each picks the better gate except with `mistakeRate`
 * chance per gate, and dodges avoidable obstacles. Deterministic per level id.
 */
export function casualWinRate(
  level: LevelData,
  rules: BattleRules,
  modifiers: BattleModifiers | undefined,
  mistakeRate: number,
  samples = 40,
): number {
  const gateCount = level.events.filter((e) => e.type === 'gate').length;
  const rand = mulberry32(level.id * 31337);
  let wins = 0;
  for (let i = 0; i < samples; i++) {
    const mistakes = Array.from({ length: gateCount }, () => rand() < mistakeRate);
    if (runPlan(level, rules, { gates: 'greedy', mistakes, dodge: true }, modifiers).won) wins++;
  }
  return wins / samples;
}

export interface LevelReport {
  id: number;
  gates: number;
  best: RunResult;
  worst: RunResult;
  winRate: number;
  bestPlan: AgentPlan;
}

/** Tries every gate combination (or a deterministic sample when there are too many). */
export function analyzeLevel(level: LevelData, rules: BattleRules, modifiers?: BattleModifiers, maxRuns = 4096): LevelReport {
  const gateCount = level.events.filter((e) => e.type === 'gate').length;
  const combos = 2 ** gateCount;
  const runs = Math.min(combos, maxRuns);
  let best: RunResult | null = null;
  let worst: RunResult | null = null;
  let bestPlan: AgentPlan = { gates: [], dodge: true };
  let wins = 0;
  let seed = 12345;
  for (let r = 0; r < runs; r++) {
    let mask = r;
    if (combos > maxRuns) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      mask = seed % combos;
    }
    const sides = Array.from({ length: gateCount }, (_, i) => (mask >> i) & 1);
    for (const dodge of [true, false]) {
      const plan = { gates: sides, dodge };
      const result = runPlan(level, rules, plan, modifiers);
      if (result.won) wins++;
      if (!best || score(result) > score(best)) {
        best = result;
        bestPlan = plan;
      }
      if (!worst || score(result) < score(worst)) worst = result;
    }
  }
  return { id: level.id, gates: gateCount, best: best!, worst: worst!, winRate: wins / (runs * 2), bestPlan };
}

function score(r: RunResult): number {
  return r.won ? 1e9 + r.power : -r.bossHpLeft;
}

