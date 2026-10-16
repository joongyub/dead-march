import type Phaser from 'phaser';

type NativeModule = typeof import('./native');

/** True inside the Android app: Capacitor puts its bridge on window before the page runs. */
export function isNativeApp(): boolean {
  const cap = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return cap?.isNativePlatform?.() === true;
}

let native: Promise<NativeModule | null> | null = null;

/** The splash never stays up longer than this, even if the game fails to start. */
const SPLASH_MAX_MS = 10000;

/**
 * App-only setup before the save is read (app storage, back button). The web build resolves at once
 * and never downloads the native code: it is a separate chunk loaded only inside the app.
 */
export function initPlatform(game: Phaser.Game): Promise<void> {
  if (!native) {
    native = isNativeApp() ? import('./native') : Promise.resolve(null);
    void native.then((m) => m && setTimeout(m.hideSplash, SPLASH_MAX_MS));
  }
  return native.then((m) => m?.installNative(game));
}

/** The first screen has drawn: lift the app's splash screen. */
export function appReady(): void {
  void native?.then((m) => m?.hideSplash());
}
