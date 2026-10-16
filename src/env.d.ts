/// <reference types="vite/client" />

declare const __APP_VERSION__: string;
declare const __BUILD_SHA__: string;
declare const __BUILD_TIME__: string;

/** Build-time settings for the Android app (.github/workflows/android.yml, docs/monetization.md). */
interface ImportMetaEnv {
  /** AdMob rewarded ad unit; Google's test unit when empty. */
  readonly VITE_ADMOB_REWARDED_ID?: string;
  /** '1' when google-services.json is in the app, so analytics go to Firebase. */
  readonly VITE_FIREBASE?: string;
}
