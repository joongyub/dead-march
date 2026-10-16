import Phaser from 'phaser';
import { Colors, DESIGN_HEIGHT, DESIGN_WIDTH, MAX_DPR } from './config';
import { flags } from './platform/flags';
import { installMobileGuards } from './platform/mobile';
import { BattleScene } from './scenes/BattleScene';
import { BootScene } from './scenes/BootScene';
import { LobbyScene } from './scenes/LobbyScene';
import { PauseScene } from './scenes/PauseScene';
import { PreloadScene } from './scenes/PreloadScene';
import { ResultScene } from './scenes/ResultScene';

installMobileGuards();

/**
 * Canvas width stays at the 720-unit design width, which is already ≤ 2 canvas pixels per CSS pixel on
 * phones. On screens narrower than 360 CSS px that would exceed MAX_DPR, so the canvas is not allowed to
 * shrink below that and the browser scales it instead (cheaper than rendering more pixels).
 */
const minCssWidth = DESIGN_WIDTH / MAX_DPR;

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
  fps: { target: 60 },
  input: { activePointers: 2 },
  scene: [BootScene, PreloadScene, LobbyScene, BattleScene, PauseScene, ResultScene],
});

if (flags.debug) {
  // Loaded only with ?debug=1 so normal players never download or run the profiler.
  void Promise.all([import('./debug/PerfMonitor'), import('./debug/DebugOverlay')]).then(
    ([{ PerfMonitor }, { DebugOverlay }]) => {
      const start = () => {
        const monitor = new PerfMonitor(game);
        new DebugOverlay(monitor);
        Object.assign(window, { __dm: { game, monitor } });
      };
      if (game.isRunning) start();
      else game.events.once(Phaser.Core.Events.READY, start);
    },
  );
}
