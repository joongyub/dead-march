import Phaser from 'phaser';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../config';

/**
 * Low-spec mode: fewer canvas pixels (75% resolution), half the particles, and at most 120 unit
 * sprites on screen instead of 200. Scenes keep laying out in the same 720-wide game units; BaseScene
 * zooms their camera to the smaller canvas, so nothing else has to know.
 */
export const quality = {
  low: false,
  /** Canvas pixels per game unit, relative to normal. */
  renderScale: 1,
  /** Multiplier for particle bursts and tracer rate. */
  particleScale: 1,
  /** Share of the unit-sprite budget (crowd + zombies) that may be on screen. */
  unitScale: 1,
};

const LOW = { renderScale: 0.75, particleScale: 0.5, unitScale: 0.6 } as const;

export type LowSpecSetting = 'auto' | 'on' | 'off';

/** Whether low-spec mode should be on for this setting, given what the detector found on this device. */
export function lowSpecWanted(setting: LowSpecSetting, detected: boolean): boolean {
  return setting === 'on' || (setting === 'auto' && detected);
}

export function setLowSpec(game: Phaser.Game, low: boolean): void {
  quality.low = low;
  quality.renderScale = low ? LOW.renderScale : 1;
  quality.particleScale = low ? LOW.particleScale : 1;
  quality.unitScale = low ? LOW.unitScale : 1;
  const width = Math.round(DESIGN_WIDTH * quality.renderScale);
  const height = Math.round(DESIGN_HEIGHT * quality.renderScale);
  // Scale.EXPAND sizes the canvas from the configured base size, so that is what changes.
  const config = game.config as { width: number; height: number };
  if (config.width === width && config.height === height) return;
  config.width = width;
  config.height = height;
  game.scale.refresh();
}

/** Screen size in game units (what layout() works in), whatever the canvas resolution. */
export function viewWidth(scale: Phaser.Scale.ScaleManager): number {
  return scale.width / quality.renderScale;
}

export function viewHeight(scale: Phaser.Scale.ScaleManager): number {
  return scale.height / quality.renderScale;
}

/** Average frame time above this for SLOW_SECONDS in a row turns 'auto' low-spec mode on. */
const SLOW_FRAME_MS = 20;
const SLOW_SECONDS = 3;
/**
 * A lone frame longer than this is a hitch (loading, a notification), not a slow device. Long frames
 * one after another are a slow device and count.
 */
const HITCH_MS = 250;

/** Watches battle frame times for the 'auto' setting. Allocation-free; call push() every frame. */
export class SlowFrameDetector {
  private bucketMs = 0;
  private bucketFrames = 0;
  private slowSeconds = 0;
  private lastLong = false;

  reset(): void {
    this.bucketMs = 0;
    this.bucketFrames = 0;
    this.slowSeconds = 0;
    this.lastLong = false;
  }

  /** Returns true once frames have been slow for SLOW_SECONDS in a row. */
  push(deltaMs: number): boolean {
    const long = deltaMs > HITCH_MS;
    const hitch = long && !this.lastLong;
    this.lastLong = long;
    if (hitch) return false;
    this.bucketMs += deltaMs;
    this.bucketFrames++;
    if (this.bucketMs < 1000) return false;
    const avg = this.bucketMs / this.bucketFrames;
    this.bucketMs = 0;
    this.bucketFrames = 0;
    this.slowSeconds = avg > SLOW_FRAME_MS ? this.slowSeconds + 1 : 0;
    return this.slowSeconds >= SLOW_SECONDS;
  }
}
