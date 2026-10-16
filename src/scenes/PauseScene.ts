import Phaser from 'phaser';
import { Colors, FONT_FAMILY, SceneKeys, TextureKeys } from '../config';
import { Button } from '../ui/Button';
import { t } from '../i18n';
import { BaseScene } from './BaseScene';
import type { BattleScene } from './BattleScene';

/** Overlay launched on top of a paused battle (pause button, app sent to background, focus lost). */
export class PauseScene extends BaseScene {
  private dim!: Phaser.GameObjects.Image;
  private label!: Phaser.GameObjects.Text;
  private resumeButton!: Button;
  private retryButton!: Button;
  private lobbyButton!: Button;
  private settingsButton!: Button;

  constructor() {
    super(SceneKeys.Pause);
  }

  create(): void {
    this.dim = this.add.image(0, 0, TextureKeys.Pixel).setOrigin(0).setTint(0x000000).setAlpha(0.65);
    this.dim.setInteractive(); // swallow taps so nothing underneath reacts
    this.label = this.add
      .text(0, 0, t('pause.title'), { fontFamily: FONT_FAMILY, fontSize: '64px', color: Colors.text, fontStyle: 'bold' })
      .setOrigin(0.5);
    this.resumeButton = new Button(this, 0, 0, t('pause.resume'), () => {
      this.scene.stop();
      this.scene.resume(SceneKeys.Battle);
    });
    this.retryButton = new Button(
      this,
      0,
      0,
      t('common.retry'),
      () => {
        this.scene.stop();
        const battle = this.scene.get(SceneKeys.Battle) as BattleScene;
        battle.scene.restart({ stage: battle.stageId });
      },
      { color: Colors.neutral },
    );
    this.lobbyButton = new Button(
      this,
      0,
      0,
      t('common.lobby'),
      () => {
        this.scene.stop(SceneKeys.Battle);
        this.scene.start(SceneKeys.Lobby);
      },
      { color: Colors.neutral },
    );
    this.settingsButton = new Button(
      this,
      0,
      0,
      t('common.settings'),
      () => {
        this.scene.pause();
        this.scene.launch(SceneKeys.Settings, { from: SceneKeys.Pause });
      },
      { color: Colors.neutral },
    );
    this.bindLayout();
  }

  protected layout(width: number, height: number): void {
    const cx = width / 2;
    this.dim.setDisplaySize(width, height);
    const top = height * 0.5 - 200;
    this.label.setPosition(cx, top - 130);
    this.resumeButton.setPosition(cx, top);
    this.retryButton.setPosition(cx, top + 130);
    this.settingsButton.setPosition(cx, top + 260);
    this.lobbyButton.setPosition(cx, top + 390);
  }
}
