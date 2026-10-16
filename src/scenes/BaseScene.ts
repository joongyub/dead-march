import Phaser from 'phaser';
import { getSafeInsets, type Insets } from '../platform/safeArea';

/**
 * Scenes lay themselves out from the current screen size, because Scale.EXPAND makes the
 * game taller on long phones. layout() runs on create and again on every resize/rotation.
 */
/** Full-screen scenes fade in this fast; switching stays under the 0.3s the roadmap allows. */
const FADE_MS = 160;

export abstract class BaseScene extends Phaser.Scene {
  protected insets: Insets = { top: 0, bottom: 0, left: 0, right: 0 };

  protected abstract layout(width: number, height: number): void;

  /** Quick fade from black for full-screen scenes (not overlays). */
  protected enter(): void {
    this.cameras.main.fadeIn(FADE_MS, 0, 0, 0);
  }

  protected bindLayout(): void {
    const apply = () => {
      this.insets = getSafeInsets(this.scale);
      this.cameras.main.setSize(this.scale.width, this.scale.height);
      this.layout(this.scale.width, this.scale.height);
    };
    apply();
    this.scale.on(Phaser.Scale.Events.RESIZE, apply);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, apply));
  }
}
