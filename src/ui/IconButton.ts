import Phaser from 'phaser';
import { ATLAS } from '../art/atlas';
import { Colors } from '../config';

/** Square button with an atlas icon (pause, settings, arrows). Fires on release, like Button. */
export class IconButton extends Phaser.GameObjects.Container {
  private readonly bg: Phaser.GameObjects.NineSlice;
  private readonly icon: Phaser.GameObjects.Image;
  private pressed = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    icon: string,
    onClick: () => void,
    { size = 88, color = Colors.neutral, iconScale = 1 }: { size?: number; color?: number; iconScale?: number } = {},
  ) {
    super(scene, x, y);
    this.bg = scene.add.nineslice(0, 0, ATLAS, 'panel', size, size, 20, 20, 20, 20).setTint(color);
    this.icon = scene.add.image(0, 0, ATLAS, icon).setScale(iconScale);
    this.add([this.bg, this.icon]);
    this.setSize(size, size);

    this.bg.setInteractive({ useHandCursor: true });
    this.bg.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
      this.pressed = true;
      this.setScale(0.92);
    });
    this.bg.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => this.release());
    this.bg.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
      const wasPressed = this.pressed;
      this.release();
      if (wasPressed) onClick();
    });
    scene.add.existing(this);
  }

  setIcon(frame: string): this {
    this.icon.setFrame(frame);
    return this;
  }

  setEnabled(enabled: boolean): this {
    this.setAlpha(enabled ? 1 : 0.35);
    if (enabled) this.bg.setInteractive();
    else this.bg.disableInteractive();
    return this;
  }

  private release(): void {
    this.pressed = false;
    this.setScale(1);
  }
}
