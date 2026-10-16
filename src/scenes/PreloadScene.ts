import Phaser from 'phaser';
import { Colors, FONT_FAMILY, SceneKeys, TextureKeys } from '../config';
import { createGameTextures } from './placeholderTextures';

/** Loading screen with a progress bar. Real assets (atlas, audio) are queued in preload() from stage 5. */
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Preload);
  }

  preload(): void {
    const { width, height } = this.scale;
    const barWidth = width * 0.6;
    const y = height * 0.55;

    this.add
      .text(width / 2, y - 60, '불러오는 중', { fontFamily: FONT_FAMILY, fontSize: '32px', color: Colors.textDim })
      .setOrigin(0.5);
    this.add.image(width / 2, y, TextureKeys.Pixel).setDisplaySize(barWidth, 16).setTint(Colors.neutral);
    const fill = this.add
      .image(width / 2 - barWidth / 2, y, TextureKeys.Pixel)
      .setOrigin(0, 0.5)
      .setDisplaySize(0, 16)
      .setTint(Colors.primary);

    this.load.on(Phaser.Loader.Events.PROGRESS, (progress: number) => fill.setDisplaySize(barWidth * progress, 16));
  }

  create(): void {
    createGameTextures(this);
    this.scene.start(SceneKeys.Lobby);
  }
}
