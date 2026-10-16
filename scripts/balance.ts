// Balance report: plays every stage with every gate combination (sampled when there are many) and prints
// how a perfect player, the worst player and a "greedy" player fare, with and without shelter upgrades.
//
// Usage: npm run balance            (writes docs/balance.md as well)
import { mkdirSync, writeFileSync } from 'node:fs';
import { analyzeLevel, casualWinRate, runPlan } from '../src/sim/agent';
import { LEVELS, RULES } from '../src/sim/rules';
import { CASUAL_MISTAKE_RATE, expectedModifiers, targetWinRate } from './levelCurve';

const NO_UPGRADES = { startBonus: 0, dpsMultiplier: 1 };
const rows: string[] = [];
rows.push('| 스테이지 | 이름 | 게이트 | 보통 플레이어 승률 (목표) | 아무렇게나 고를 때 승률 | 잘 고를 때 | 업그레이드 없이 | 최선(남은 병력) | 최악 | 시간(초) |');
rows.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');

const fmt = (r: { won: boolean; power: number; bossHpLeft: number }) =>
  r.won ? `승리 ${r.power}` : `패배 (보스 ${Math.round(r.bossHpLeft)} 남음)`;

for (const level of LEVELS) {
  const mods = expectedModifiers(level.id);
  const t0 = Date.now();
  const report = analyzeLevel(level, RULES, mods, Number(process.env.MAX_RUNS ?? 512));
  const greedy = runPlan(level, RULES, { gates: 'greedy', dodge: true }, mods);
  const bare = runPlan(level, RULES, { gates: 'greedy', dodge: true }, NO_UPGRADES);
  const casual = casualWinRate(level, RULES, mods, CASUAL_MISTAKE_RATE);
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  rows.push(
    `| ${level.id} | ${level.name} | ${report.gates} | ${pct(casual)} (${pct(targetWinRate(level.id))}) | ${pct(report.winRate)} | ${fmt(greedy)} | ${fmt(bare)} | ${fmt(report.best)} | ${fmt(report.worst)} | ${Math.round(greedy.time)} |`,
  );
  console.error(`stage ${level.id} done in ${Date.now() - t0}ms`);
}

const out = [
  '# 밸런스 보고서',
  '',
  '`npm run balance`로 다시 만들 수 있습니다. 모든 수치는 전투 규칙과 같은 시뮬레이터(src/sim/)로 실제로 플레이해서 얻은 값입니다.',
  '',
  `- 보통 플레이어: 게이트마다 ${Math.round(CASUAL_MISTAKE_RATE * 100)}% 확률로 나쁜 쪽을 고르고, 피할 수 있는 장애물은 피함. 스테이지 생성기(npm run gen-levels)가 이 승률을 목표에 맞춘다.`,
  '- 아무렇게나 고를 때: 모든 게이트 조합(많으면 표본)을 장애물 피하기/안 피하기로 모두 돌린 승률.',
  '- 잘 고를 때: 매 게이트에서 당장 병력이 더 많아지는 쪽을 고름.',
  '- 업그레이드 = 그 스테이지에 도달한 보통 플레이어가 가졌을 피난처 강화(scripts/levelCurve.ts). "업그레이드 없이"는 강화 없이 잘 고를 때.',
  '',
  ...rows,
  '',
].join('\n');
mkdirSync('docs', { recursive: true });
writeFileSync('docs/balance.md', out);
console.log(out);
