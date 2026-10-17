import Phaser from 'phaser';
import { Colors, FONT_FAMILY, SceneKeys, TextureKeys } from '../config';
import { buildAtlas } from '../art/atlas';
import { audio } from '../audio/Audio';
import { lowSpecWanted, setLowSpec } from '../core/quality';
import { save } from '../game/save';
import { resolveLang, setLang, t } from '../i18n';
import { initPlatform } from '../platform/app';
import { loadBattleWorld } from '../world3d/registry';

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
      .text(width / 2, y - 60, t('loading'), { fontFamily: FONT_FAMILY, fontSize: '32px', color: Colors.textDim })
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
    // Inside the Android app the save lives in app storage, so that has to be set up before reading it.
    void initPlatform(this.game)
      .then(() => save.load())
      .then(() => {
        // The atlas draws pop-up words, so the language must be known first.
        setLang(resolveLang(save.data.settings.lang));
        setLowSpec(this.game, lowSpecWanted(save.data.settings.lowSpec, save.data.device.lowSpec));
        buildAtlas(this);
        void loadBattleWorld(this.game);
        audio.setEnabled(save.data.settings.sound);
        // Sounds render in the background; the lobby does not wait for them.
        void audio.preload();
        this.scene.start(SceneKeys.Title);
      });
  }
}
