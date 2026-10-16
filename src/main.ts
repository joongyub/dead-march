import Phaser from 'phaser';
import { audio } from './audio/Audio';
import { save } from './game/save';
import { Colors, DESIGN_HEIGHT, DESIGN_WIDTH, MAX_DPR } from './config';
import { quality, setLowSpec } from './core/quality';
import { greedySide } from './sim/agent';
import { resolveLang, setLang } from './i18n';
import { flags } from './platform/flags';
import { installMobileGuards } from './platform/mobile';
import { BattleScene } from './scenes/BattleScene';
import { BootScene } from './scenes/BootScene';
import { LobbyScene } from './scenes/LobbyScene';
import { PauseScene } from './scenes/PauseScene';
import { PreloadScene } from './scenes/PreloadScene';
import { ResultScene } from './scenes/ResultScene';
import { SettingsScene } from './scenes/SettingsScene';
import { ShelterScene } from './scenes/ShelterScene';
import { TitleScene } from './scenes/TitleScene';

installMobileGuards();

/**
 * Canvas width stays at the 720-unit design width, which is already ≤ 2 canvas pixels per CSS pixel on
 * phones. On screens narrower than 360 CSS px that would exceed MAX_DPR, so the canvas is not allowed to
 * shrink below that and the browser scales it instead (cheaper than rendering more pixels).
 */
const minCssWidth = DESIGN_WIDTH / MAX_DPR;

// Device language until the save (which may hold the player's choice) is loaded.
setLang(resolveLang('auto'));

const game = new Phaser.Game({
  type: Phaser.AUTO, // WebGL, falling back to Canvas on devices without it
  parent: 'game',
  backgroundColor: Colors.background,
  banner: false,
  disableContextMenu: true,
  scale: {
    mode: Phaser.Scale.EXPAND,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: DESIGN_WIDTH,
    height: DESIGN_HEIGHT,
    min: { width: minCssWidth, height: minCssWidth * (DESIGN_HEIGHT / DESIGN_WIDTH) },
  },
  render: {
    antialias: true,
    roundPixels: true,
    powerPreference: 'default', // phones: avoid forcing the hungriest GPU mode (heat, battery)
  },
  // The limiter is on at a rate no screen reaches, so calm scenes can lower it (core/frameRate.ts).
  fps: { target: 60, limit: 240 },
  input: { activePointers: 2 },
  scene: [BootScene, PreloadScene, TitleScene, LobbyScene, ShelterScene, BattleScene, PauseScene, ResultScene, SettingsScene],
});

// Browsers only allow sound after a touch; every touch makes sure audio is running.
document.addEventListener('pointerdown', () => audio.unlock(), { passive: true });
game.events.on(Phaser.Core.Events.HIDDEN, () => {
  audio.suspend();
  // The app may be killed in the background; write progress now.
  void save.flush();
});
game.events.on(Phaser.Core.Events.VISIBLE, () => audio.resume());

if (flags.debug) {
  // Loaded only with ?debug=1 so normal players never download or run the profiler.
  void Promise.all([import('./debug/PerfMonitor'), import('./debug/DebugOverlay')]).then(
    ([{ PerfMonitor }, { DebugOverlay }]) => {
      const start = () => {
        const monitor = new PerfMonitor(game);
        new DebugOverlay(monitor);
        Object.assign(window, {
          __dm: { game, monitor, save, quality, greedySide, setLowSpec: (low: boolean) => setLowSpec(game, low) },
        });
      };
      if (game.isRunning) start();
      else game.events.once(Phaser.Core.Events.READY, start);
    },
  );
}
