import type { LevelData, LevelEvent } from '../sim/types';

/**
 * ?stress=1: an army of 5,000 against back-to-back hordes of every kind, with gates to keep it growing.
 * Used to measure frame time under the heaviest load the game can produce; not a real stage.
 */
export function stressLevel(): LevelData {
  const events: LevelEvent[] = [];
  const kinds = ['walker', 'runner', 'brute', 'exploder'];
  let z = 900;
  for (let i = 0; i < 40; i++) {
    if (i % 3 === 0) events.push({ type: 'gate', z, left: '+800', right: 'x2' });
    else if (i % 3 === 1) events.push({ type: 'horde', z, kind: kinds[i % 4], count: 900, x: 0.5, w: 1 });
    else {
      events.push({ type: 'horde', z, kind: 'walker', count: 600, x: 0.27, w: 0.5 });
      events.push({ type: 'horde', z: z + 120, kind: 'runner', count: 600, x: 0.73, w: 0.5 });
    }
    z += 700;
  }
  return {
    id: 0,
    name: '스트레스 테스트',
    length: z + 400,
    start: 5000,
    events,
    boss: { kind: 'queen', hp: 5_000_000, dps: 40 },
    reward: 0,
  };
}
