import Phaser from 'phaser';
import { ATLAS } from '../art/atlas';
import { audio } from '../audio/Audio';
import { Colors } from '../config';

const W = 120;
const H = 64;

/** On/off switch. The touch area is larger than the drawn switch (at least 80×80 game units). */
export class Toggle extends Phaser.GameObjects.Container {
  private readonly track: Phaser.GameObjects.NineSlice;
  private readonly knob: Phaser.GameObjects.Image;
  private value: boolean;

  constructor(scene: Phaser.Scene, x: number, y: number, initial: boolean, onChange: (value: boolean) => void) {
    super(scene, x, y);
    this.value = initial;
    this.track = scene.add.nineslice(0, 0, ATLAS, 'pill', W, H, 30, 30, 0, 0);
    this.knob = scene.add.image(0, 0, ATLAS, 'circle').setScale(0.82);
    this.add([this.track, this.knob]);
    this.setSize(W + 40, 96);
    this.setInteractive({ useHandCursor: true });
    this.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
      this.value = !this.value;
      audio.play('click');
      this.render();
      onChange(this.value);
    });
    this.render();
    scene.add.existing(this);
  }

  private render(): void {
    this.track.setTint(this.value ? Colors.primary : Colors.neutral);
    this.knob.setX(this.value ? W / 2 - H / 2 : -W / 2 + H / 2);
  }
}
