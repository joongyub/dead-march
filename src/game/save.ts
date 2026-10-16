import { storage } from '../platform/storage';

/**
 * Everything the game remembers between sessions, in one versioned document.
 *
 * Bump SAVE_VERSION whenever an existing field changes shape or meaning, and add a migration from the
 * previous version, so an update never wipes a player's progress (a new field with a default only needs
 * freshSave and normalize). Each write also keeps the previous good copy as a backup;
 * a corrupted save (bad JSON, failed checksum) is restored from it instead of being reset.
 */
export const SAVE_VERSION = 2;

export const MAIN_KEY = 'dead-march.save';
export const BACKUP_KEY = 'dead-march.save.backup';
/** An unreadable main save is parked here before being replaced, so it can still be looked at. */
export const UNREADABLE_KEY = 'dead-march.save.unreadable';

export type ResourceId = 'food' | 'scrap' | 'fuel';

export interface SaveData {
  version: number;
  /** Highest stage the player may start (1-based). */
  unlocked: number;
  /** Best army size left at the end, per cleared stage id. */
  best: Record<string, number>;
  resources: Record<ResourceId, number>;
  /** Building id → level (0 = not built). */
  buildings: Record<string, number>;
  settings: {
    sound: boolean;
    vibration: boolean;
    shake: boolean;
    /** 'auto' turns on low-spec mode when frames run slow. */
    lowSpec: 'auto' | 'on' | 'off';
    lang: 'auto' | 'ko' | 'en';
  };
  /** Lessons already learned: steering, gates and merges in stage 1, then the first shelter upgrade. */
  tutorial: { swipe: boolean; gate: boolean; merge: boolean; shelter: boolean };
  stats: { battles: number; wins: number; zombies: number };
  /** Idle rewards: when they were last collected, and the latest time the game saw (clock-rollback guard). */
  idle: { collectedAt: number; lastSeen: number };
  /** Purchases and ad-free flag (stage 10). */
  shop: { noAds: boolean; owned: string[] };
  /** What the game learned about this device: battles ran slow, so 'auto' low-spec mode is on. */
  device: { lowSpec: boolean };
}

export function freshSave(now = Date.now()): SaveData {
  return {
    version: SAVE_VERSION,
    unlocked: 1,
    best: {},
    resources: { food: 0, scrap: 0, fuel: 0 },
    buildings: {},
    settings: { sound: true, vibration: true, shake: true, lowSpec: 'auto', lang: 'auto' },
    tutorial: { swipe: false, gate: false, merge: false, shelter: false },
    stats: { battles: 0, wins: 0, zombies: 0 },
    idle: { collectedAt: now, lastSeen: now },
    shop: { noAds: false, owned: [] },
    device: { lowSpec: false },
  };
}

/** Upgrades a save written by an older version, one version at a time. */
const MIGRATIONS: Record<number, (old: Record<string, unknown>) => Record<string, unknown>> = {
  // 1 → 2: the single tutorial flag became one flag per lesson.
  1: (old) => {
    const done = (old.tutorial as { done?: boolean } | undefined)?.done === true;
    return { ...old, tutorial: { swipe: done, gate: done, merge: done, shelter: done } };
  },
};

/** Fills in anything missing (older or hand-edited saves) with defaults, field by field. */
function normalize(raw: Record<string, unknown>): SaveData {
  const base = freshSave();
  const merged = { ...base, ...raw } as SaveData;
  merged.resources = { ...base.resources, ...(raw.resources as object) };
  merged.settings = { ...base.settings, ...(raw.settings as object) };
  merged.tutorial = { ...base.tutorial, ...(raw.tutorial as object) };
  merged.stats = { ...base.stats, ...(raw.stats as object) };
  merged.idle = { ...base.idle, ...(raw.idle as object) };
  merged.shop = { ...base.shop, ...(raw.shop as object) };
  merged.device = { ...base.device, ...(raw.device as object) };
  merged.best = { ...(raw.best as object) };
  merged.buildings = { ...(raw.buildings as object) };
  merged.version = SAVE_VERSION;
  if (!Number.isFinite(merged.unlocked) || merged.unlocked < 1) merged.unlocked = 1;
  for (const key of Object.keys(merged.resources) as ResourceId[]) {
    if (!Number.isFinite(merged.resources[key]) || merged.resources[key] < 0) merged.resources[key] = 0;
  }
  return merged;
}

export function migrate(raw: Record<string, unknown>): SaveData {
  let doc = raw;
  let version = typeof doc.version === 'number' ? doc.version : 1;
  if (version > SAVE_VERSION) throw new Error(`Save is from a newer version (${version})`);
  while (version < SAVE_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) throw new Error(`No migration from save version ${version}`);
    doc = step(doc);
    version++;
    doc.version = version;
  }
  return normalize(doc);
}

/** FNV-1a hash of the JSON text, stored next to it to catch truncated or corrupted writes. */
function checksum(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

function encode(data: SaveData): string {
  const body = JSON.stringify(data);
  return JSON.stringify({ h: checksum(body), d: body });
}

function decode(text: string | null): SaveData | null {
  if (!text) return null;
  try {
    const wrapper = JSON.parse(text) as { h?: string; d?: string };
    if (typeof wrapper.d !== 'string' || wrapper.h !== checksum(wrapper.d)) return null;
    return migrate(JSON.parse(wrapper.d) as Record<string, unknown>);
  } catch {
    return null;
  }
}

/**
 * The one place that reads and writes the save. Load once at startup, change `data` freely, and call
 * `commit()`; writes are batched so many small changes in one frame cost one write.
 */
class SaveStore {
  data: SaveData = freshSave();
  /** True when the main save was unreadable and the backup (or a fresh save) was used. */
  recovered = false;
  private pending: ReturnType<typeof setTimeout> | null = null;

  async load(): Promise<void> {
    const backend = storage();
    const main = decode(await backend.read(MAIN_KEY));
    if (main) {
      this.data = main;
      return;
    }
    const rawMain = await backend.read(MAIN_KEY);
    const hadMain = rawMain !== null;
    const backup = decode(await backend.read(BACKUP_KEY));
    this.recovered = hadMain;
    this.data = backup ?? freshSave();
    if (hadMain) {
      await backend.write(UNREADABLE_KEY, rawMain);
      await this.flush();
    }
  }

  /** Schedules a write soon (coalesces bursts of changes). */
  commit(): void {
    if (this.pending) return;
    this.pending = setTimeout(() => {
      this.pending = null;
      void this.flush();
    }, 250);
  }

  /** Writes now: the current main copy becomes the backup first. */
  async flush(): Promise<void> {
    if (this.pending) {
      clearTimeout(this.pending);
      this.pending = null;
    }
    // The idle clock guard needs the latest time this device has shown (see meta/shelter.ts guardClock).
    this.data.idle.lastSeen = Math.max(this.data.idle.lastSeen, Date.now());
    const backend = storage();
    const current = await backend.read(MAIN_KEY);
    if (current && decode(current)) await backend.write(BACKUP_KEY, current);
    await backend.write(MAIN_KEY, encode(this.data));
  }

  async reset(): Promise<void> {
    this.data = freshSave();
    await this.flush();
  }
}

export const save = new SaveStore();
