/**
 * Ads, in-app purchases and analytics sit behind these small interfaces. The web build uses pretend
 * versions (services/web.ts) so everything can be tried in a browser; the Android app swaps in AdMob,
 * Google Play Billing and Firebase (services/native.ts). Until real IDs are filled in
 * (docs/monetization.md) the app shows Google's test ads, and no money changes hands.
 */

export type ProductId = 'remove_ads' | 'supply_crate';

export interface Product {
  id: ProductId;
  /** Price as the store shows it in the player's currency, e.g. "₩3,900". Empty when unknown. */
  price: string;
}

export interface AdsService {
  /** Shows a rewarded ad. Resolves true only if the player watched it to the end. */
  showRewarded(placement: string): Promise<boolean>;
  /** Some regions (EU) require a way to change ad consent later; settings shows a button for it. */
  privacyOptionsRequired(): boolean;
  showPrivacyOptions(): Promise<void>;
}

export interface PurchasesService {
  /** Store prices for the products; may be missing ones the store does not know yet. */
  products(): Promise<Product[]>;
  /** Resolves true once the store says the purchase went through; the game then grants it. */
  buy(id: ProductId): Promise<boolean>;
  /** Non-consumable products this store account owns (for "restore purchases"). */
  restore(): Promise<ProductId[]>;
}

export type AnalyticsParams = Record<string, string | number | boolean>;

export interface AnalyticsService {
  /** Event names: lowercase with underscores, at most 40 characters (Firebase rules). */
  log(event: string, params?: AnalyticsParams): void;
}

export interface Services {
  ads: AdsService;
  purchases: PurchasesService;
  analytics: AnalyticsService;
}
