import type Phaser from 'phaser';

/** A scene that knows what the Android back button (or Escape on the web) means while it is on top. */
export interface BackAware {
  /** Returns false when there is nowhere to go back to (the app should go to the background). */
  onBack(): boolean;
}

function isBackAware(scene: Phaser.Scene): scene is Phaser.Scene & BackAware {
  return typeof (scene as Partial<BackAware>).onBack === 'function';
}

/**
 * Asks the top running scene to go back. Overlays (settings, pause, result) sit later in the scene list
 * than the screen under them, and the screen under an overlay is paused, so the first running one wins.
 */
export function handleBack(game: Phaser.Game): boolean {
  const running = game.scene.getScenes(true, true);
  for (const scene of running) {
    if (isBackAware(scene)) return scene.onBack();
  }
  // Nothing running means a screen is changing (the pause menu or the next screen starts on the next
  // frame). Swallow the press rather than sending the app to the background.
  return running.length === 0;
}
