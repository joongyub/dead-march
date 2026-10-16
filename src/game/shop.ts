import shopData from '../data/shop.json';
import type { ProductId } from '../services/types';
import type { Reward } from './progress';
import { save, type ResourceId } from './save';

export interface ProductDef {
  id: ProductId;
  /** Consumables can be bought again and again; non-consumables once per store account. */
  type: 'consumable' | 'nonConsumable';
  /** Shown on the web, where there is no store to ask for the local price. */
  webPrice: string;
  grant: { noAds?: boolean } & Partial<Record<ResourceId, number>>;
}

const SHOP = shopData as { adRewardMultiplier: number; products: ProductDef[] };

export const PRODUCTS: readonly ProductDef[] = SHOP.products;
/** Watching an ad after a battle multiplies its reward by this. */
export const AD_REWARD_MULTIPLIER = SHOP.adRewardMultiplier;

const RESOURCES: readonly ResourceId[] = ['food', 'scrap', 'fuel'];

export function productDef(id: ProductId): ProductDef {
  const def = PRODUCTS.find((p) => p.id === id);
  if (!def) throw new Error(`Unknown product ${id}`);
  return def;
}

/** True after "remove ads" was bought: reward doubling no longer asks for an ad. */
export function hasNoAds(): boolean {
  return save.data.shop.noAds;
}

export function owns(id: ProductId): boolean {
  return save.data.shop.owned.includes(id);
}

/**
 * Gives the player what a product contains, after the store confirmed the purchase. A non-consumable
 * is granted once; buying or restoring it again changes nothing. Returns false in that case.
 */
export function grantProduct(id: ProductId): boolean {
  const def = productDef(id);
  const shop = save.data.shop;
  if (def.type === 'nonConsumable') {
    if (shop.owned.includes(id)) return false;
    shop.owned.push(id);
  }
  if (def.grant.noAds) shop.noAds = true;
  for (const r of RESOURCES) save.data.resources[r] += def.grant[r] ?? 0;
  // Paid items are written at once rather than in the next batch.
  void save.flush();
  return true;
}

/** Restores non-consumables the store says this account owns; returns the ones that were missing. */
export function restoreProducts(ids: readonly ProductId[]): ProductId[] {
  const restored: ProductId[] = [];
  for (const id of ids) {
    if (PRODUCTS.some((p) => p.id === id && p.type === 'nonConsumable') && grantProduct(id)) restored.push(id);
  }
  return restored;
}

/** The extra a reward gets from an ad (or for free with remove-ads): reward × (multiplier − 1). */
export function adBonus(reward: Reward): Reward {
  const extra = AD_REWARD_MULTIPLIER - 1;
  return { food: Math.floor(reward.food * extra), scrap: Math.floor(reward.scrap * extra), fuel: Math.floor(reward.fuel * extra) };
}

/** Adds the ad bonus to the save and returns it. */
export function grantAdBonus(reward: Reward): Reward {
  const bonus = adBonus(reward);
  for (const r of RESOURCES) save.data.resources[r] += bonus[r];
  save.commit();
  return bonus;
}
