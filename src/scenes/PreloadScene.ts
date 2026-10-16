import Phaser from 'phaser';
import { Colors, FONT_FAMILY, SceneKeys, TextureKeys } from '../config';
import { buildAtlas } from '../art/atlas';
import { audio } from '../audio/Audio';
import { save } from '../game/save';

/** Loading screen: draws the battle atlas, loads the save, then opens the lobby. */
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
    buildAtlas(this);
    void save.load().then(() => {
      audio.setEnabled(save.data.settings.sound);
      // Sounds render in the background; the lobby does not wait for them.
      void audio.preload();
      this.scene.start(SceneKeys.Lobby);
    });
  }
}
