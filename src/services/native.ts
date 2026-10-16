import { AdMob, AdmobConsentStatus, RewardAdPluginEvents, type AdmobConsentInfo } from '@capacitor-community/admob';
import { NativePurchases, PURCHASE_TYPE } from '@capgo/native-purchases';
import { registerPlugin } from '@capacitor/core';
import { hasNoAds, PRODUCTS } from '../game/shop';
import type { AdsService, AnalyticsService, ProductId, PurchasesService, Services } from './types';

/**
 * The Android app's real services (loaded only inside the app, from platform/native.ts):
 * AdMob rewarded ads with Google's consent form, Google Play Billing, and Firebase Analytics.
 * IDs come from the build (docs/monetization.md); without them the app uses Google's test ads.
 */

/** Google's sample IDs: always show test ads and never pay out. */
const TEST_REWARDED_ID = 'ca-app-pub-3940256099942544/5224354917';
const rewardedId = import.meta.env.VITE_ADMOB_REWARDED_ID || TEST_REWARDED_ID;
const usingTestAds = rewardedId === TEST_REWARDED_ID;

let consent: AdmobConsentInfo | null = null;
let adsReady: Promise<void> | null = null;

/** Starts AdMob and asks for consent where the law needs it (EU/UK), once. */
function startAds(): Promise<void> {
  adsReady ??= (async () => {
    consent = await AdMob.requestConsentInfo();
    if (consent.status === AdmobConsentStatus.REQUIRED && consent.isConsentFormAvailable) {
      consent = await AdMob.showConsentForm();
    }
    await AdMob.initialize({ initializeForTesting: usingTestAds });
  })().catch(() => {
    adsReady = null; // try again on the next ad
  });
  return adsReady ?? Promise.resolve();
}

const ads: AdsService = {
  async showRewarded() {
    await startAds();
    if (consent && !consent.canRequestAds) return false;
    try {
      await AdMob.prepareRewardVideoAd({ adId: rewardedId, isTesting: usingTestAds, immersiveMode: true });
    } catch {
      return false; // no ad available (offline, no fill)
    }
    // The plugin's show call only settles when a reward is earned, so the outcome is read from events:
    // the ad closing (with or without the reward) or failing to open.
    let rewarded = false;
    let settle: (watched: boolean) => void = () => {};
    const result = new Promise<boolean>((resolve) => (settle = resolve));
    const handles = await Promise.all([
      AdMob.addListener(RewardAdPluginEvents.Rewarded, () => {
        rewarded = true;
      }),
      AdMob.addListener(RewardAdPluginEvents.Dismissed, () => settle(rewarded)),
      AdMob.addListener(RewardAdPluginEvents.FailedToShow, () => settle(false)),
    ]);
    AdMob.showRewardVideoAd().catch(() => settle(false));
    const watched = await result;
    for (const h of handles) void h.remove();
    return watched;
  },
  // The plugin does not export this enum; its values are plain strings.
  privacyOptionsRequired: () => String(consent?.privacyOptionsRequirementStatus) === 'REQUIRED',
  async showPrivacyOptions() {
    await AdMob.showPrivacyOptionsForm();
  },
};

const purchases: PurchasesService = {
  async products() {
    const { products } = await NativePurchases.getProducts({
      productIdentifiers: PRODUCTS.map((p) => p.id),
      productType: PURCHASE_TYPE.INAPP,
    });
    return products
      .filter((p) => PRODUCTS.some((d) => d.id === p.identifier))
      .map((p) => ({ id: p.identifier as ProductId, price: p.priceString }));
  },
  async buy(id) {
    const def = PRODUCTS.find((p) => p.id === id);
    try {
      const tx = await NativePurchases.purchaseProduct({
        productIdentifier: id,
        productType: PURCHASE_TYPE.INAPP,
        // Consumables are used up right away so they can be bought again.
        isConsumable: def?.type === 'consumable',
      });
      // "0" is a pending payment (e.g. cash at a store); it is granted later by restore.
      return tx.purchaseState === undefined || tx.purchaseState === '1';
    } catch {
      return false; // cancelled or failed
    }
  },
  async restore() {
    await NativePurchases.restorePurchases();
    const { purchases: list } = await NativePurchases.getPurchases({ productType: PURCHASE_TYPE.INAPP });
    return list
      .filter((p) => p.purchaseState === undefined || p.purchaseState === '1')
      .map((p) => p.productIdentifier as ProductId);
  },
};

/** Only the two calls the game uses; registered by name so the plugin's web code (and Firebase JS) stays out. */
interface FirebaseAnalyticsPlugin {
  logEvent(options: { name: string; params?: Record<string, string | number | boolean> }): Promise<void>;
  setEnabled(options: { enabled: boolean }): Promise<void>;
}

function analyticsService(): AnalyticsService {
  // The build sets VITE_FIREBASE=1 only when google-services.json was added (docs/monetization.md).
  if (import.meta.env.VITE_FIREBASE !== '1') return { log() {} };
  const firebase = registerPlugin<FirebaseAnalyticsPlugin>('FirebaseAnalytics');
  return {
    log(event, params) {
      void firebase.logEvent(params ? { name: event, params } : { name: event }).catch(() => {});
    },
  };
}

export function nativeServices(): Services {
  // Consent and the ads SDK start shortly after launch (once the save is loaded), so the first ad opens
  // sooner; nothing starts after remove-ads was bought.
  setTimeout(() => {
    if (!hasNoAds()) void startAds();
  }, 3000);
  return { ads, purchases, analytics: analyticsService() };
}
