// Save format, recovery and language checks. Run with `npm test`.
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { BACKUP_KEY, MAIN_KEY, migrate, save, SAVE_VERSION, UNREADABLE_KEY } from '../src/game/save';
import { en } from '../src/i18n/en';
import { resolveLang } from '../src/i18n';
import { ko } from '../src/i18n/ko';
import { setStorageBackend, type StorageBackend } from '../src/platform/storage';

const disk = new Map<string, string>();
const memory: StorageBackend = {
  read: async (key) => disk.get(key) ?? null,
  write: async (key, value) => void disk.set(key, value),
  remove: async (key) => void disk.delete(key),
};
setStorageBackend(memory);

beforeEach(() => {
  disk.clear();
  save.recovered = false;
});

test('version 1 saves move to per-lesson tutorial flags', () => {
  const learned = migrate({ version: 1, unlocked: 4, tutorial: { done: true } });
  assert.equal(learned.version, SAVE_VERSION);
  assert.equal(learned.unlocked, 4);
  assert.deepEqual(learned.tutorial, { swipe: true, gate: true, merge: true, shelter: true });
  const fresh = migrate({ version: 1, tutorial: { done: false } });
  assert.deepEqual(fresh.tutorial, { swipe: false, gate: false, merge: false, shelter: false });
});

test('a save round-trips through storage', async () => {
  await save.load();
  save.data.unlocked = 7;
  save.data.buildings.wall = 3;
  await save.flush();
  save.data.unlocked = 1;
  await save.load();
  assert.equal(save.data.unlocked, 7);
  assert.equal(save.data.buildings.wall, 3);
  assert.equal(save.recovered, false);
});

test('a corrupted main save is restored from the backup, not reset', async () => {
  await save.load();
  save.data.unlocked = 5;
  await save.flush();
  save.data.unlocked = 6;
  await save.flush(); // backup = 5, main = 6
  const broken = disk.get(MAIN_KEY)!.slice(0, 40); // a write cut off halfway
  disk.set(MAIN_KEY, broken);
  await save.load();
  assert.equal(save.recovered, true);
  assert.equal(save.data.unlocked, 5);
  assert.equal(disk.get(UNREADABLE_KEY), broken);
  // The restored copy is written back as the main save.
  await save.load();
  assert.equal(save.data.unlocked, 5);
});

test('a save whose checksum does not match is treated as corrupted', async () => {
  await save.load();
  save.data.unlocked = 3;
  await save.flush();
  await save.flush();
  const wrapper = JSON.parse(disk.get(MAIN_KEY)!) as { h: string; d: string };
  disk.set(MAIN_KEY, JSON.stringify({ h: wrapper.h, d: wrapper.d.replace('"unlocked":3', '"unlocked":20') }));
  await save.load();
  assert.equal(save.recovered, true);
  assert.equal(save.data.unlocked, 3);
});

test('with both copies unreadable the game starts fresh instead of crashing', async () => {
  disk.set(MAIN_KEY, 'garbage');
  disk.set(BACKUP_KEY, '{"h":"1","d":"{}"}');
  await save.load();
  assert.equal(save.recovered, true);
  assert.equal(save.data.unlocked, 1);
});

test('device language picks Korean or English, English for anything else', () => {
  assert.equal(resolveLang('auto', ['ko-KR', 'en-US']), 'ko');
  assert.equal(resolveLang('auto', ['fr-FR', 'en-GB']), 'en');
  assert.equal(resolveLang('auto', ['ja-JP']), 'en');
  assert.equal(resolveLang('auto', []), 'en');
  assert.equal(resolveLang('ko', ['en-US']), 'ko');
  assert.equal(resolveLang('en', ['ko-KR']), 'en');
});

test('every English line exists and keeps the Korean placeholders', () => {
  const holes = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  for (const key of Object.keys(ko) as (keyof typeof ko)[]) {
    assert.ok(en[key]?.trim(), `missing English text for ${key}`);
    assert.deepEqual(holes(en[key]), holes(ko[key]), `placeholders differ for ${key}`);
  }
});
