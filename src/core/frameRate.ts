import type Phaser from 'phaser';

/**
 * Caps how often the game draws. Calm screens (lobby, shelter) run at 30 fps to save battery and heat;
 * battles run uncapped (the display's own rate). The game starts with Phaser's frame limiter enabled
 * at a high rate (see main.ts) so that this only has to change the limiter's interval.
 *
 * `_limitRate` is Phaser 3.90's internal interval for that limiter (pinned version, see package.json).
 */
export function setFrameCap(game: Phaser.Game, fps: number): void {
  const loop = game.loop as unknown as { _limitRate: number };
  // A couple of ms of slack so a 60 Hz screen reliably draws every second frame instead of jittering.
  loop._limitRate = fps > 0 ? 1000 / fps - 2 : 0;
}
