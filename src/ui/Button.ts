import Phaser from 'phaser';
import { ATLAS } from '../art/atlas';
import { audio } from '../audio/Audio';
import { Colors, FONT_FAMILY, TextureKeys } from '../config';

export interface ButtonOptions {
  width?: number;
  height?: number;
  color?: number;
  fontSize?: number;
}

/** Rounded button that fires on release (like native buttons), with a press-down scale. */
export class Button extends Phaser.GameObjects.Container {
  private readonly bg: Phaser.GameObjects.NineSlice;
  private readonly label: Phaser.GameObjects.Text;
  private pressed = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    label: string,
    onClick: () => void,
    { width = 360, height = 104, color = Colors.primary, fontSize = 40 }: ButtonOptions = {},
  ) {
    super(scene, x, y);
    // The battle atlas has the same rounded panel; using it keeps buttons in the atlas draw batch.
    const [key, frame] = scene.textures.exists(ATLAS) ? [ATLAS, 'panel'] : [TextureKeys.Panel, undefined];
    this.bg = scene.add.nineslice(0, 0, key, frame, width, height, 20, 20, 20, 20).setTint(color);
    this.label = scene.add
      .text(0, 0, label, { fontFamily: FONT_FAMILY, fontSize: `${fontSize}px`, color: Colors.text, fontStyle: 'bold' })
      .setOrigin(0.5);
    this.add([this.bg, this.label]);
    this.setSize(width, height);

    this.bg.setInteractive({ useHandCursor: true });
    this.bg.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
      this.pressed = true;
      this.setScale(0.96);
    });
    this.bg.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => this.release());
    this.bg.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
      const wasPressed = this.pressed;
      this.release();
      if (!wasPressed) return;
      audio.play('click');
      onClick();
    });
    scene.add.existing(this);
  }

  setLabel(text: string): this {
    this.label.setText(text);
    return this;
  }

  private release(): void {
    this.pressed = false;
    this.setScale(1);
  }
}
