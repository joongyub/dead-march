// Estimates how long a typical player needs to clear all 20 stages, shelter included, and writes
// docs/playtime.md. Every battle outcome comes from the real battle simulator (src/sim/) with the
// shelter bonuses the simulated player has bought at that moment.
//
// The simulated player: picks the better gate 70% of the time, dodges obstacles, plays sessions of
// SESSION_MINUTES with AWAY_HOURS between them (idle resources pile up meanwhile), spends everything on
// the cheapest-to-justify upgrade after each battle, and replays the last cleared stage when the next
// one looks hopeless.
//
// Usage: npm run playtime
import { writeFileSync } from 'node:fs';
import { battleReward } from '../src/game/progress';
import {
  BUILDING_IDS,
  canAfford,
  collectIdle,
  levelOf,
  nextCost,
  shelterModifiers,
  upgrade,
  type BuildingId,
  type IdleClock,
  type Resources,
} from '../src/meta/shelter';
import { casualRuns, mulberry32 } from '../src/sim/agent';
import { LEVELS, RULES } from '../src/sim/rules';
import { CASUAL_MISTAKE_RATE, expectedModifiers } from './levelCurve';

const SESSION_MINUTES = 15;
const AWAY_HOURS = 4;
const SESSIONS_PER_DAY = 4;
/** Lobby, result screen and shelter visits around each battle. */
const OVERHEAD_SECONDS = 25;
/** Below this chance the player farms the last cleared stage instead. */
const ATTEMPT_THRESHOLD = 0.2;
/** How far a lost battle usually got (loss rewards scale with it). */
const LOSS_PROGRESS = 0.6;
const PLAYERS = 24;
const SAMPLES = 24;
/** Lower = bought first. A balanced player keeps the farm a level behind the wall, and so on. */
const PRIORITY: Record<BuildingId, number> = { wall: 0, armory: 0, farm: 1, radio: 2, garage: 3 };

interface StageStats {
  winRate: number;
  /** Average army left when winning. */
  powerLeft: number;
  /** Average battle length in seconds. */
  time: number;
}

const cache = new Map<string, StageStats>();

function stageStats(stage: number, buildings: Record<string, number>): StageStats {
  const mods = shelterModifiers(buildings);
  const key = `${stage}:${mods.startBonus}:${mods.dpsMultiplier}:${mods.mergeBonus}`;
  let stats = cache.get(key);
  if (!stats) {
    const runs = casualRuns(LEVELS[stage - 1], RULES, mods, CASUAL_MISTAKE_RATE, SAMPLES);
    const wins = runs.filter((r) => r.won);
    stats = {
      winRate: wins.length / runs.length,
      powerLeft: wins.length ? wins.reduce((s, r) => s + r.power, 0) / wins.length : 0,
      time: runs.reduce((s, r) => s + r.time, 0) / runs.length,
    };
    cache.set(key, stats);
  }
  return stats;
}

interface Player {
  resources: Resources;
  buildings: Record<string, number>;
  idle: IdleClock;
  best: Set<number>;
  unlocked: number;
  /** Simulated wall-clock (ms) and active play (seconds). */
  now: number;
  played: number;
  sessions: number;
  battles: number;
}

interface StageRecord {
  minutes: number;
  attempts: number;
  firstTryWinRate: number;
  levels: Record<BuildingId, number>;
}

function spend(p: Player): void {
  for (;;) {
    let pick: BuildingId | null = null;
    let score = Infinity;
    for (const id of BUILDING_IDS) {
      const cost = nextCost(p.buildings, id);
      if (!cost || !canAfford(p.resources, cost)) continue;
      const s = levelOf(p.buildings, id) + PRIORITY[id];
      if (s < score) {
        score = s;
        pick = id;
      }
    }
    // Saving up: never buy the lower-priority buildings past the wall and armory.
    if (!pick || (PRIORITY[pick] > 0 && score > Math.min(levelOf(p.buildings, 'wall'), levelOf(p.buildings, 'armory')) + PRIORITY[pick])) {
      return;
    }
    upgrade(p, pick);
  }
}

function simulatePlayer(seed: number): Map<number, StageRecord> {
  const rand = mulberry32(seed);
  const start = Date.UTC(2026, 0, 1);
  const p: Player = {
    resources: { food: 0, scrap: 0, fuel: 0 },
    buildings: {},
    idle: { collectedAt: start, lastSeen: start },
    best: new Set(),
    unlocked: 1,
    now: start,
    played: 0,
    sessions: 0,
    battles: 0,
  };
  const records = new Map<number, StageRecord>();
  const attempts = new Map<number, number>();
  const firstTry = new Map<number, number>();

  while (!p.best.has(LEVELS.length) && p.battles < 4000) {
    // New session: collect what piled up while away, then build.
    p.sessions++;
    collectIdle(p, p.now);
    spend(p);
    const sessionEnd = p.played + SESSION_MINUTES * 60;
    while (p.played < sessionEnd && !p.best.has(LEVELS.length)) {
      let stage = p.unlocked;
      let stats = stageStats(stage, p.buildings);
      if (!firstTry.has(stage)) firstTry.set(stage, stats.winRate);
      if (stats.winRate < ATTEMPT_THRESHOLD && stage > 1) {
        stage = stage - 1;
        stats = stageStats(stage, p.buildings);
      } else {
        attempts.set(stage, (attempts.get(stage) ?? 0) + 1);
      }
      const won = rand() < stats.winRate;
      const level = LEVELS[stage - 1];
      const reward = battleReward(level, won, stats.powerLeft, won ? 1 : LOSS_PROGRESS, p.best.has(stage));
      p.resources.food += reward.food;
      p.resources.scrap += reward.scrap;
      p.resources.fuel += reward.fuel;
      const seconds = stats.time + OVERHEAD_SECONDS;
      p.played += seconds;
      p.now += seconds * 1000;
      p.battles++;
      if (won && !p.best.has(stage)) {
        p.best.add(stage);
        p.unlocked = Math.min(LEVELS.length, stage + 1);
        records.set(stage, {
          minutes: p.played / 60,
          attempts: attempts.get(stage) ?? 1,
          firstTryWinRate: firstTry.get(stage) ?? stats.winRate,
          levels: Object.fromEntries(BUILDING_IDS.map((id) => [id, levelOf(p.buildings, id)])) as Record<BuildingId, number>,
        });
      }
      spend(p);
    }
    p.now += AWAY_HOURS * 3_600_000;
  }
  records.set(0, {
    minutes: p.played / 60,
    attempts: p.battles,
    firstTryWinRate: p.sessions,
    levels: Object.fromEntries(BUILDING_IDS.map((id) => [id, levelOf(p.buildings, id)])) as Record<BuildingId, number>,
  });
  return records;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
};

function main(): void {
  const t0 = Date.now();
  const players = Array.from({ length: PLAYERS }, (_, i) => simulatePlayer(1000 + i));
  const pick = (stage: number, f: (r: StageRecord) => number) =>
    median(players.map((p) => p.get(stage)).filter((r): r is StageRecord => !!r).map(f));

  const finished = players.filter((p) => p.has(LEVELS.length)).length;
  const totalMin = pick(0, (r) => r.minutes);
  const battles = pick(0, (r) => r.attempts);
  const sessions = pick(0, (r) => r.firstTryWinRate);

  const lines: string[] = [];
  lines.push('# 플레이 시간 추정');
  lines.push('');
  lines.push('`npm run playtime`으로 다시 만들 수 있습니다. 전투 결과는 모두 실제 전투 시뮬레이터(src/sim/)로 그때까지 산 피난처 강화를 반영해 돌린 값입니다.');
  lines.push('');
  lines.push(`- 가상 플레이어 ${PLAYERS}명: 게이트마다 ${CASUAL_MISTAKE_RATE * 100}% 확률로 나쁜 쪽을 고르고, 한 번에 ${SESSION_MINUTES}분씩 하고 ${AWAY_HOURS}시간 쉬는(하루 ${SESSIONS_PER_DAY}번) 사람.`);
  lines.push(`- 전투마다 앞뒤 화면에 ${OVERHEAD_SECONDS}초를 더함. 다음 스테이지 승률이 ${ATTEMPT_THRESHOLD * 100}% 미만이면 마지막으로 깬 스테이지를 다시 해서 자원을 모음.`);
  lines.push('- 자원은 생기는 대로 방벽·무기고를 먼저 올리고, 농장·무전실·정비고는 그보다 1~3레벨 낮게 따라감.');
  lines.push('- 표의 값은 모두 중앙값.');
  lines.push('');
  lines.push(`**20스테이지까지 실제 플레이 ${(totalMin / 60).toFixed(1)}시간 (전투 ${battles}판, 접속 ${sessions}번, 하루 ${SESSIONS_PER_DAY}번 접속하면 약 ${Math.ceil(sessions / SESSIONS_PER_DAY)}일).** 끝까지 간 가상 플레이어 ${finished}/${PLAYERS}명.`);
  lines.push('');
  lines.push('| 스테이지 | 처음 깬 시점(플레이 분) | 도전 횟수 | 처음 도전 때 승률 | 방벽 | 무기고 | 정비고 | 농장 | 무전실 | 생성기가 가정한 방벽·무기고 |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (let n = 1; n <= LEVELS.length; n++) {
    const exp = expectedModifiers(n);
    const expLevel = 1 + exp.startBonus / 4;
    lines.push(
      `| ${n} | ${pick(n, (r) => r.minutes).toFixed(0)} | ${pick(n, (r) => r.attempts)} | ${Math.round(pick(n, (r) => r.firstTryWinRate) * 100)}% | ${pick(n, (r) => r.levels.wall)} | ${pick(n, (r) => r.levels.armory)} | ${pick(n, (r) => r.levels.garage)} | ${pick(n, (r) => r.levels.farm)} | ${pick(n, (r) => r.levels.radio)} | ${expLevel} |`,
    );
  }
  lines.push('');
  writeFileSync('docs/playtime.md', lines.join('\n'));
  console.log(lines.slice(9).join('\n'));
  console.log(`(${cache.size} battle setups simulated in ${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}

main();
