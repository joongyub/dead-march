import { App } from '@capacitor/app';
import { Preferences } from '@capacitor/preferences';
import { SplashScreen } from '@capacitor/splash-screen';
import type Phaser from 'phaser';
import { setServices } from '../services';
import { nativeServices } from '../services/native';
import { handleBack } from './back';
import { setStorageBackend } from './storage';

/**
 * Android app only, loaded on demand by platform/app.ts. Saves go to the app's own storage
 * (Capacitor Preferences, which Android backs up with the Google account), the back button walks
 * back through the game's screens before sending the app to the background, and ads, purchases and
 * analytics use the real services.
 */
export function installNative(game: Phaser.Game): void {
  setServices(nativeServices());
  setStorageBackend({
    async read(key) {
      return (await Preferences.get({ key })).value;
    },
    async write(key, value) {
      await Preferences.set({ key, value });
    },
    async remove(key) {
      await Preferences.remove({ key });
    },
  });
  void App.addListener('backButton', () => {
    if (!handleBack(game)) void App.minimizeApp();
  });
}

let hidden = false;

export function hideSplash(): void {
  if (hidden) return;
  hidden = true;
  void SplashScreen.hide({ fadeOutDuration: 200 });
}
