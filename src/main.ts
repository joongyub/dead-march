import Phaser from 'phaser';
import { audio } from './audio/Audio';
import { save } from './game/save';
import { Colors, DESIGN_HEIGHT, DESIGN_WIDTH, MAX_DPR } from './config';
import { quality, setLowSpec } from './core/quality';
import { greedySide } from './sim/agent';
import { resolveLang, setLang } from './i18n';
import { flags } from './platform/flags';
import { handleBack } from './platform/back';
import { installMobileGuards } from './platform/mobile';
import { eventLog } from './services/web';
import { BattleScene } from './scenes/BattleScene';
import { BootScene } from './scenes/BootScene';
import { LobbyScene } from './scenes/LobbyScene';
import { PauseScene } from './scenes/PauseScene';
import { PreloadScene } from './scenes/PreloadScene';
import { ResultScene } from './scenes/ResultScene';
import { SettingsScene } from './scenes/SettingsScene';
import { ShelterScene } from './scenes/ShelterScene';
import { ShopScene } from './scenes/ShopScene';
import { TitleScene } from './scenes/TitleScene';
import { createSharedContext } from './world3d/context';

installMobileGuards();

/**
 * Canvas width stays at the 720-unit design width, which is already ≤ 2 canvas pixels per CSS pixel on
 * phones. On screens narrower than 360 CSS px that would exceed MAX_DPR, so the canvas is not allowed to
 * shrink below that and the browser scales it instead (cheaper than rendering more pixels).
 */
const minCssWidth = DESIGN_WIDTH / MAX_DPR;

// Device language until the save (which may hold the player's choice) is loaded.
setLang(resolveLang('auto'));

// Phaser draws on a WebGL2 context made here (its config types only name the 2D context), so the 3D battle (Three.js) can share the canvas. Without
// WebGL2 Phaser makes its own context (and the battle says it cannot run).
const canvas = document.createElement('canvas');
const context = createSharedContext(canvas);

const game = new Phaser.Game({
  type: context ? Phaser.WEBGL : Phaser.AUTO,
  ...(context ? { canvas, context: context as unknown as CanvasRenderingContext2D } : {}),
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
  scene: [BootScene, PreloadScene, TitleScene, LobbyScene, ShelterScene, BattleScene, PauseScene, ResultScene, SettingsScene, ShopScene],
});

// Browsers only allow sound after a touch; every touch makes sure audio is running.
document.addEventListener('pointerdown', () => audio.unlock(), { passive: true });
game.events.on(Phaser.Core.Events.HIDDEN, () => {
  audio.suspend();
  // The app may be killed in the background; write progress now.
  void save.flush();
});
game.events.on(Phaser.Core.Events.VISIBLE, () => audio.resume());
// Escape on the web does what the Android back button does in the app (platform/native.ts).
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !event.repeat) handleBack(game);
});

if (flags.debug) {
  // Loaded only with ?debug=1 so normal players never download or run the profiler.
  void Promise.all([import('./debug/PerfMonitor'), import('./debug/DebugOverlay')]).then(
    ([{ PerfMonitor }, { DebugOverlay }]) => {
      const start = () => {
        const monitor = new PerfMonitor(game);
        new DebugOverlay(monitor);
        Object.assign(window, {
          __dm: { game, monitor, save, quality, greedySide, events: eventLog, setLowSpec: (low: boolean) => setLowSpec(game, low) },
        });
      };
      if (game.isRunning) start();
      else game.events.once(Phaser.Core.Events.READY, start);
    },
  );
}
