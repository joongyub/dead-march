import Phaser from 'phaser';
import { quality } from '../core/quality';
import { getSafeInsets, type Insets } from '../platform/safeArea';

/** Full-screen scenes fade in this fast; switching stays under the 0.3s the roadmap allows. */
const FADE_MS = 160;

/**
 * Scenes lay themselves out from the current screen size, because Scale.EXPAND makes the
 * game taller on long phones. layout() runs on create and again on every resize/rotation, and when
 * low-spec mode changes the canvas resolution: sizes are always in game units (720 wide), and the
 * camera zooms them onto the canvas.
 */
export abstract class BaseScene extends Phaser.Scene {
  protected insets: Insets = { top: 0, bottom: 0, left: 0, right: 0 };

  protected abstract layout(width: number, height: number): void;

  /** Quick fade from black for full-screen scenes (not overlays). */
  protected enter(): void {
    this.cameras.main.fadeIn(FADE_MS, 0, 0, 0);
  }

  protected bindLayout(): void {
    const apply = () => {
      const s = quality.renderScale;
      this.insets = getSafeInsets(this.scale, s);
      this.cameras.main.setSize(this.scale.width, this.scale.height).setOrigin(0, 0).setZoom(s);
      this.layout(this.scale.width / s, this.scale.height / s);
    };
    apply();
    this.scale.on(Phaser.Scale.Events.RESIZE, apply);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, apply));
  }
}
