// Rule checks that need no browser: shelter economy, idle clock guard, save migration, garage bonus.
// Run with `npm test` (node's built-in test runner through tsx).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { freshSave, migrate } from '../src/game/save';
import {
  BUILDING_IDS,
  collectIdle,
  guardClock,
  idlePending,
  levelOf,
  maxLevel,
  nextCost,
  shelterModifiers,
  upgrade,
} from '../src/meta/shelter';
import { Army } from '../src/sim/Army';
import { RULES } from '../src/sim/rules';

const HOUR = 3_600_000;

test('every building has 20 levels, free level 1, and costs that never go down', () => {
  for (const id of BUILDING_IDS) {
    assert.equal(maxLevel(id), 20);
    let prev = 0;
    for (let level = 1; level < 20; level++) {
      const cost = nextCost({ [id]: level }, id)!;
      const total = (cost.food ?? 0) + (cost.scrap ?? 0) + (cost.fuel ?? 0) * 20;
      assert.ok(total >= prev, `${id} level ${level + 1} is cheaper than the one before`);
      prev = total;
    }
    assert.equal(nextCost({ [id]: 20 }, id), null);
  }
});

test('upgrade pays the cost and refuses when short', () => {
  const state = { buildings: {} as Record<string, number>, resources: { food: 1000, scrap: 1000, fuel: 100 } };
  const cost = nextCost(state.buildings, 'wall')!;
  assert.ok(upgrade(state, 'wall'));
  assert.equal(levelOf(state.buildings, 'wall'), 2);
  assert.equal(state.resources.food, 1000 - (cost.food ?? 0));
  const broke = { buildings: {} as Record<string, number>, resources: { food: 0, scrap: 0, fuel: 0 } };
  assert.equal(upgrade(broke, 'wall'), false);
  assert.equal(levelOf(broke.buildings, 'wall'), 1);
});

test('shelter levels turn into battle bonuses', () => {
  assert.deepEqual(shelterModifiers({}), { startBonus: 0, dpsMultiplier: 1, mergeBonus: 0 });
  const m = shelterModifiers({ wall: 6, armory: 6, garage: 11 });
  assert.equal(m.startBonus, 20);
  assert.equal(m.dpsMultiplier, 1.25);
  assert.equal(m.mergeBonus, 0.1);
});

test('idle resources pile up for at most 8 hours', () => {
  const start = Date.UTC(2026, 0, 1);
  const s = { ...freshSave(start), buildings: { farm: 1 } as Record<string, number> };
  assert.equal(idlePending(s.buildings, s.idle, start + 2 * HOUR).food, 16);
  assert.equal(idlePending(s.buildings, s.idle, start + 30 * HOUR).food, 64);
  const got = collectIdle(s, start + 3 * HOUR);
  assert.equal(got.food, 24);
  assert.equal(s.resources.food, 24);
  assert.equal(idlePending(s.buildings, s.idle, start + 3 * HOUR).food, 0);
});

test('turning the clock back earns nothing until real time catches up', () => {
  const start = Date.UTC(2026, 0, 1);
  const s = freshSave(start);
  // Cheat: jump a day ahead, collect, jump back.
  const future = start + 24 * HOUR;
  collectIdle(s, future);
  assert.equal(guardClock(s.idle, start + HOUR), true);
  assert.equal(idlePending(s.buildings, s.idle, start + 5 * HOUR).food, 0);
  // Once real time passes the faked moment, the farm works again.
  assert.equal(idlePending(s.buildings, s.idle, future + 2 * HOUR).food, 16);
  // Small clock drift (a minute) is not treated as cheating.
  const t = freshSave(start);
  guardClock(t.idle, start + HOUR);
  assert.equal(guardClock(t.idle, start + HOUR - 60_000), false);
});

test('old or damaged saves load with defaults instead of crashing', () => {
  const data = migrate({ version: 1, unlocked: -3, resources: { food: 'x', scrap: 5 } });
  assert.equal(data.unlocked, 1);
  assert.equal(data.resources.food, 0);
  assert.equal(data.resources.scrap, 5);
  assert.deepEqual(data.buildings, {});
  assert.throws(() => migrate({ version: 999 }));
});

test('garage bonus adds units on merges and is off by default', () => {
  const plain = new Army(RULES.tiers);
  plain.reset(1000);
  const bonus = new Army(RULES.tiers, 0.1);
  bonus.reset(1000);
  assert.equal(plain.power, 1000);
  assert.ok(bonus.power > plain.power, `bonus ${bonus.power} should beat ${plain.power}`);
  assert.ok(bonus.power < plain.power * 1.4);
});
