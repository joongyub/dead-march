// Difficulty curve shared by the level generator and the balance report.
import type { BattleModifiers } from '../src/sim/BattleSim';

export const LEVEL_NAMES = [
  '버려진 고속도로', '무너진 주유소', '텅 빈 시장', '폐교 운동장', '경찰서 앞',
  '지하철 입구', '공사장', '병원 주차장', '화학 공장', '군 검문소',
  '항구 창고', '놀이공원', '끊어진 다리', '쇼핑몰', '방송국',
  '공항 활주로', '발전소', '연구소 외곽', '감염 구역 중심', '여왕의 둥지',
];

/**
 * Shelter upgrades a typical player has when reaching stage n (see src/meta/shelter.ts).
 * Stages 1–5 need none; from stage 11 on, a player without upgrades is expected to struggle.
 */
export function expectedModifiers(n: number): BattleModifiers {
  const k = Math.max(0, n - 5);
  return { startBonus: k * 4, dpsMultiplier: 1 + k * 0.05 };
}

/** Chance a casual player picks the worse gate (see casualWinRate in gen-levels.ts). */
export const CASUAL_MISTAKE_RATE = 0.3;

/**
 * Share of casual players (better gate 70% of the time, dodging obstacles) who should clear each stage
 * with the expected upgrades. Roadmap curve: stages 1–5 almost always cleared, stage 10 only with good
 * choices, and from 11 on the shelter upgrades carry the player. Every fifth stage is a boss stage.
 */
const TARGET_WIN_RATES = [
  0.95, 0.92, 0.89, 0.86, 0.8, // 1–5
  0.75, 0.68, 0.6, 0.52, 0.3, // 6–10
  0.6, 0.55, 0.5, 0.45, 0.3, // 11–15
  0.55, 0.5, 0.45, 0.4, 0.25, // 16–20
];

export function targetWinRate(n: number): number {
  return TARGET_WIN_RATES[Math.min(n, TARGET_WIN_RATES.length) - 1];
}

/** What each stage brings in for the first time (shown on the stage card and used by the generator). */
export const STAGE_INTRO: Record<number, string> = {
  1: '더하기·곱하기 게이트',
  2: '빼기 게이트와 비켜 갈 수 있는 좀비 떼',
  3: '합체 게이트',
  4: '바리케이드',
  5: '주자 좀비, 첫 보스 도살자',
  6: '분해 게이트와 병과 게이트',
  7: '탱커 좀비',
  8: '나누기 함정과 연속 습격',
  9: '폭발 좀비',
  10: '보스 거대 좀비',
  11: '길을 막는 바리케이드',
  12: '세 배 게이트',
  15: '보스 괴수',
  20: '최종 보스 감염 여왕',
};
