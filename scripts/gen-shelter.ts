// Writes src/data/shelter.json: cost and effect of every shelter building level, from the curves below.
// Effects line up with expectedModifiers() in levelCurve.ts (the upgrades the stage generator assumed),
// so a player keeping the wall and armory at "stage − 4" meets each stage at its target difficulty.
// After changing anything here run `npm run playtime` to see how long the 20 stages take.
//
// Usage: npm run gen-shelter
import { writeFileSync } from 'node:fs';
import type { BuildingDef, BuildingEffect, Cost, ShelterData } from '../src/meta/shelter';

const MAX_LEVEL = 20;

/** Rounds costs to friendly numbers: 5s under 1000, 10s above. */
function nice(x: number): number {
  if (x <= 0) return 0;
  if (x < 20) return Math.ceil(x);
  return x < 1000 ? Math.round(x / 5) * 5 : Math.round(x / 10) * 10;
}

/** a·(t)^p where t = level − 1, the number of upgrades so far. */
const curve = (a: number, p: number) => (level: number) => nice(a * (level - 1) ** p);
/** Starts costing only from `from`, growing linearly. */
const from = (start: number, a: number) => (level: number) => (level < start ? 0 : Math.ceil(a * (level - start + 1)));

interface Spec {
  id: BuildingDef['id'];
  name: string;
  desc: string;
  cost: Partial<Record<keyof Cost, (level: number) => number>>;
  effect: (level: number) => BuildingEffect;
}

const round2 = (x: number) => Math.round(x * 100) / 100;

const SPECS: Spec[] = [
  {
    id: 'wall',
    name: '방벽',
    desc: '출격할 때 따라 나서는 생존자가 늘어납니다.',
    cost: { food: curve(30, 1.2), scrap: curve(10, 1.15) },
    effect: (l) => ({ startBonus: 4 * (l - 1) }),
  },
  {
    id: 'armory',
    name: '무기고',
    desc: '모든 병과의 사격 피해가 커집니다.',
    cost: { scrap: curve(36, 1.2), fuel: from(6, 0.8) },
    effect: (l) => ({ dpsMultiplier: round2(1 + 0.05 * (l - 1)) }),
  },
  {
    id: 'garage',
    name: '정비고',
    desc: '합체할 때 덤으로 병력이 더 생깁니다.',
    cost: { scrap: curve(40, 1.3), fuel: curve(1.2, 1) },
    effect: (l) => ({ mergeBonus: round2(0.01 * (l - 1)) }),
  },
  {
    id: 'farm',
    name: '농장',
    desc: '자리를 비운 동안 식량이 쌓입니다(최대 8시간).',
    cost: { scrap: curve(22, 1.3), food: curve(14, 1.3) },
    effect: (l) => ({ foodPerHour: 8 + 4 * (l - 1) }),
  },
  {
    id: 'radio',
    name: '무전실',
    desc: '보급 상자로 고철과 연료가 들어옵니다(최대 8시간).',
    cost: { scrap: curve(30, 1.3), fuel: from(4, 0.6) },
    effect: (l) => ({ scrapPerHour: 6 + 3 * (l - 1), fuelPerHour: round2(0.3 + 0.1 * (l - 1)) }),
  },
];

const data: ShelterData = {
  idleMaxHours: 8,
  rollbackToleranceMinutes: 5,
  buildings: SPECS.map((spec) => ({
    id: spec.id,
    name: spec.name,
    desc: spec.desc,
    levels: Array.from({ length: MAX_LEVEL }, (_, i) => {
      const level = i + 1;
      const cost: Cost = {};
      if (level > 1) {
        for (const [r, f] of Object.entries(spec.cost) as [keyof Cost, (l: number) => number][]) {
          const v = f(level);
          if (v > 0) cost[r] = v;
        }
      }
      return { cost, effect: spec.effect(level) };
    }),
  })),
};

// One level per line keeps the file easy to read and diff.
const text = JSON.stringify(data, null, 2).replace(/\{\s+"cost": \{[^}]*\},\s+"effect": \{[^}]*\}\s+\}/g, (m) =>
  JSON.stringify(JSON.parse(m)).replace(/,"/g, ', "').replace(/":/g, '": '),
);
writeFileSync('src/data/shelter.json', text + '\n');
for (const b of data.buildings) {
  const total: Record<string, number> = {};
  for (const l of b.levels) for (const [r, v] of Object.entries(l.cost)) total[r] = (total[r] ?? 0) + (v ?? 0);
  console.log(b.name.padEnd(4), 'Lv2', JSON.stringify(b.levels[1].cost), 'Lv20', JSON.stringify(b.levels[19].cost), 'total', JSON.stringify(total));
}
