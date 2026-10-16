// Generates src/data/levels.json: 20 stages laid out from a difficulty curve, then tuned with the battle
// simulator so a target share of casual players (who sometimes pick the worse gate) clears each stage.
//
// Usage: npm run gen-levels
// The output is plain JSON; hand edits are fine, then run `npm run balance` to see the effect.
import { writeFileSync } from 'node:fs';
import unitsJson from '../src/data/units.json';
import zombiesJson from '../src/data/zombies.json';
import { Army, parseOp } from '../src/sim/Army';
import { armyStrength, casualWinRate } from '../src/sim/agent';
import type { BattleModifiers, BattleRules } from '../src/sim/BattleSim';
import type { LevelData, LevelEvent, TierDef } from '../src/sim/types';
import { CASUAL_MISTAKE_RATE, expectedModifiers, LEVEL_NAMES, STAGE_INTRO, targetWinRate } from './levelCurve';

const RULES: BattleRules = {
  tiers: unitsJson.tiers as TierDef[],
  zombies: zombiesJson.kinds,
  bosses: zombiesJson.bosses,
};

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function nice(v: number): number {
  if (v < 10) return Math.max(1, Math.round(v));
  if (v < 50) return Math.round(v / 5) * 5;
  if (v < 200) return Math.round(v / 10) * 10;
  if (v < 1000) return Math.round(v / 50) * 50;
  return Math.round(v / 100) * 100;
}

interface Draft {
  level: LevelData;
  /** Indices into level.events whose counts/hp scale with difficulty. */
  hordeBase: number[];
  barricadeBase: number[];
  bossHpBase: number;
  bossDpsBase: number;
}

function draftLevel(n: number): Draft {
  const rand = mulberry32(n * 7919);
  const pick = <T>(items: T[]) => items[Math.floor(rand() * items.length)];
  const between = (a: number, b: number) => a + (b - a) * rand();

  const length = 11600 + 420 * n;
  const start = 10;
  const ref = new Army(RULES.tiers);
  ref.reset(start + expectedModifiers(n).startBonus);

  const events: LevelEvent[] = [];
  const hordeBase: number[] = [];
  const barricadeBase: number[] = [];

  // Each stage introduces one new element (see STAGE_INTRO in levelCurve.ts).
  // Most gates offer real growth; traps and "lesser evil" pairs are rationed.
  const gateKinds = ['addVsMul', 'addVsMul', 'addVsAdd'];
  if (n <= 3) gateKinds.push('goodVsBad');
  if (n >= 2) gateKinds.push('mulVsBad');
  if (n >= 3) gateKinds.push('mergeVsAdd');
  if (n >= 6) gateKinds.push('addVsUnit', 'addVsUnit', 'splitVsAdd', 'mergeVsSplit');
  if (n >= 8) gateKinds.push('mulVsDivTrap');
  if (n >= 12) gateKinds.push('bigMul');
  let lesserEvilLeft = n >= 11 ? 1 : 0;

  const zombieKinds = ['walker'];
  if (n >= 5) zombieKinds.push('runner');
  if (n >= 7) zombieKinds.push('brute');
  if (n >= 9) zombieKinds.push('exploder');

  const unitFor = (power: number) => (power >= 400 ? 'tank' : power >= 100 ? 'gunner' : 'soldier');
  const unitPower: Record<string, number> = { soldier: 10, gunner: 50, tank: 200 };

  const makeGate = (z: number) => {
    const E = ref.power;
    let kind = n === 1 && events.length < 2 ? 'goodVsBad' : pick(gateKinds);
    // A stage's new gate shows up early so the player meets it.
    if (events.length === 2 && n === 3) kind = 'mergeVsAdd';
    if (events.length === 2 && n === 6) kind = 'mergeVsSplit';
    if (events.length === 2 && n === 8) kind = 'mulVsDivTrap';
    if (events.length === 2 && n === 12) kind = 'bigMul';
    if (lesserEvilLeft > 0 && events.length > 6 && rand() < 0.25) {
      kind = 'badVsBad';
      lesserEvilLeft--;
    }
    let a: string;
    let b: string;
    switch (kind) {
      case 'addVsMul':
        a = `+${nice(E * between(0.5, 1.4))}`;
        b = 'x2';
        break;
      case 'addVsAdd':
        a = `+${nice(E * between(0.3, 0.6))}`;
        b = `+${nice(E * between(0.7, 1.1))}`;
        break;
      case 'goodVsBad':
        a = `+${nice(E * between(0.6, 1.2))}`;
        b = `-${nice(E * between(0.12, 0.25))}`;
        break;
      case 'mulVsBad':
        a = 'x2';
        b = `-${nice(E * between(0.15, 0.3))}`;
        break;
      case 'badVsBad':
        a = `-${nice(E * between(0.25, 0.45))}`;
        b = '/2';
        break;
      case 'addVsUnit': {
        const unit = unitFor(E);
        const count = Math.max(1, Math.round((E * between(0.5, 0.9)) / unitPower[unit]));
        a = `+${nice(E * between(0.6, 1.0))}`;
        b = `+${count} ${unit}`;
        break;
      }
      case 'mergeVsAdd':
        a = 'merge';
        b = `+${nice(E * between(0.15, 0.35))}`;
        break;
      case 'splitVsAdd':
        a = 'split';
        b = `+${nice(E * between(0.3, 0.6))}`;
        break;
      case 'mergeVsSplit':
        a = 'merge';
        b = 'split';
        break;
      case 'mulVsDivTrap':
        a = 'x2';
        b = `/${pick([2, 3])}`;
        break;
      default:
        a = 'x3';
        b = `+${nice(E * between(1.5, 2.5))}`;
    }
    const [left, right] = rand() < 0.5 ? [a, b] : [b, a];
    events.push({ type: 'gate', z, left, right });
    // Reference player takes the better side.
    const tryOp = (text: string) => {
      const army = new Army(RULES.tiers);
      army.counts.splice(0, 4, ...ref.counts);
      army.apply(parseOp(text));
      return army;
    };
    const la = tryOp(left);
    const ra = tryOp(right);
    ref.counts.splice(0, 4, ...(armyStrength(la) >= armyStrength(ra) ? la.counts : ra.counts));
  };

  const makeEncounter = (z: number) => {
    const E = ref.power;
    const roll = rand();
    const barricadeChance = n >= 4 ? 0.28 : 0;
    if (roll < barricadeChance || (n === 4 && barricadeBase.length === 0)) {
      const partial = n < 11 || rand() < 0.6;
      const hp = Math.max(5, Math.round(E * between(0.25, 0.45)));
      const x = partial ? pick([0.3, 0.7]) : 0.5;
      events.push({ type: 'barricade', z, hp, x, w: partial ? 0.6 : 1 });
      barricadeBase.push(events.length - 1);
      if (!partial) ref.damage(hp * 0.5);
      return;
    }
    const kindId = pick(zombieKinds);
    const kind = RULES.zombies[kindId];
    const partial = (n >= 2 && rand() < 0.3) || (n === 2 && hordeBase.length === 0);
    const share = between(0.3, 0.5) + Math.min(0.15, n * 0.008);
    const count = Math.max(3, Math.round((E * share) / (kind.power + (kind.blast ?? 0))));
    const x = partial ? pick([0.27, 0.73]) : 0.5;
    events.push({ type: 'horde', z, kind: kindId, count, x, w: partial ? 0.5 : 1 });
    hordeBase.push(events.length - 1);
    if (!partial) ref.damage(count * kind.power * 0.6);
  };

  let z = 1300;
  while (z < length - 900) {
    makeGate(z);
    z += Math.round(between(650, 900));
    if (z >= length - 600) break;
    makeEncounter(z);
    if (n >= 8 && rand() < 0.25 && z + 450 < length - 600) {
      z += 450;
      makeEncounter(z);
    }
    z += Math.round(between(650, 900));
  }

  const E = Math.max(10, ref.power);
  // Every fifth stage ends with a named boss; the rest end with a pack leader.
  const bossKind = n % 5 === 0 ? (['butcher', 'hulk', 'abomination', 'queen'][n / 5 - 1] ?? 'queen') : 'alpha';
  const bossLevel = n % 5 === 0 ? 1.5 : 1;
  const level: LevelData = {
    id: n,
    name: LEVEL_NAMES[n - 1] ?? `구역 ${n}`,
    length,
    start,
    events,
    boss: { kind: bossKind, hp: 0, dps: 0 },
    reward: 40 + n * 15,
    ...(STAGE_INTRO[n] ? { intro: STAGE_INTRO[n] } : {}),
  };
  return { level, hordeBase, barricadeBase, bossHpBase: E * 1.1 * bossLevel, bossDpsBase: E * 0.09 * bossLevel };
}

function scaled(d: Draft, m: number): LevelData {
  const events = d.level.events.map((e) => ({ ...e }));
  for (const i of d.hordeBase) {
    const e = events[i] as Extract<LevelEvent, { type: 'horde' }>;
    e.count = Math.max(2, nice(e.count * m));
  }
  for (const i of d.barricadeBase) {
    const e = events[i] as Extract<LevelEvent, { type: 'barricade' }>;
    e.hp = Math.max(4, nice(e.hp * m));
  }
  return {
    ...d.level,
    events,
    boss: { ...d.level.boss, hp: nice(d.bossHpBase * m), dps: Math.max(1, nice(d.bossDpsBase * m)) },
  };
}

function winRate(level: LevelData, mods: BattleModifiers): number {
  return casualWinRate(level, RULES, mods, CASUAL_MISTAKE_RATE);
}

const levels: LevelData[] = [];
for (let n = 1; n <= 20; n++) {
  const draft = draftLevel(n);
  const mods = expectedModifiers(n);
  const target = targetWinRate(n);
  // Difficulty multiplier: higher m = more zombies, sturdier boss. Binary search toward the target win rate.
  let lo = 0.1;
  let hi = 8;
  for (let i = 0; i < 16; i++) {
    const m = (lo + hi) / 2;
    if (winRate(scaled(draft, m), mods) >= target) lo = m;
    else hi = m;
  }
  const level = scaled(draft, lo);
  levels.push(level);
  console.log(`level ${n}: m=${lo.toFixed(2)} winRate=${winRate(level, mods).toFixed(2)} target=${target}`);
}

writeFileSync('src/data/levels.json', `${JSON.stringify({ levels }, null, 1)}\n`);
console.log('wrote src/data/levels.json');
