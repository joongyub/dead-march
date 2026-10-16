import { building, type BuildingId, type ResourceId } from '../meta/shelter';
import type { LevelData } from '../sim/types';
import { EN_BUILDINGS, EN_STAGE_INTROS, EN_STAGE_NAMES, EN_UNIT_NAMES, EN_ZOMBIE_NAMES, en } from './en';
import { ko, type MessageKey } from './ko';

export type Lang = 'ko' | 'en';
export type LangSetting = 'auto' | Lang;

const TABLES: Record<Lang, Record<MessageKey, string>> = { ko, en };
let lang: Lang = 'ko';

/** Korean devices get Korean, everything else English, unless the player picked one in settings. */
export function resolveLang(setting: LangSetting, deviceLangs: readonly string[] = navigator.languages ?? [navigator.language]): Lang {
  if (setting !== 'auto') return setting;
  for (const l of deviceLangs) {
    if (l.toLowerCase().startsWith('ko')) return 'ko';
    if (l.toLowerCase().startsWith('en')) return 'en';
  }
  return 'en';
}

export function setLang(next: Lang): void {
  lang = next;
  document.documentElement.lang = next;
}

export function currentLang(): Lang {
  return lang;
}

/** Text for `key` in the current language, with `{name}` placeholders filled from `params`. */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const text = TABLES[lang][key] ?? ko[key];
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m));
}

export function stageName(level: LevelData): string {
  return lang === 'en' ? (EN_STAGE_NAMES[level.id - 1] ?? level.name) : level.name;
}

export function stageIntro(level: LevelData): string | undefined {
  if (!level.intro) return undefined;
  return lang === 'en' ? (EN_STAGE_INTROS[level.id] ?? level.intro) : level.intro;
}

/** Zombie or boss display name by kind id; `fallback` is the Korean name from the data file. */
export function zombieName(kind: string, fallback: string): string {
  return lang === 'en' ? (EN_ZOMBIE_NAMES[kind] ?? fallback) : fallback;
}

export function unitName(id: string, fallback: string): string {
  return lang === 'en' ? (EN_UNIT_NAMES[id] ?? fallback) : fallback;
}

export function buildingName(id: BuildingId): string {
  return lang === 'en' ? EN_BUILDINGS[id].name : building(id).name;
}

export function buildingDesc(id: BuildingId): string {
  return lang === 'en' ? EN_BUILDINGS[id].desc : building(id).desc;
}

export function resourceName(r: ResourceId): string {
  return t(`res.${r}`);
}
