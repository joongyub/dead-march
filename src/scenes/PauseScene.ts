import Phaser from 'phaser';
import { Colors, FONT_FAMILY, SceneKeys, TextureKeys } from '../config';
import { Button } from '../ui/Button';
import { BaseScene } from './BaseScene';

/** Overlay launched on top of a paused battle (pause button, app sent to background, focus lost). */
export class PauseScene extends BaseScene {
  private dim!: Phaser.GameObjects.Image;
  private label!: Phaser.GameObjects.Text;
  private resumeButton!: Button;
  private lobbyButton!: Button;

  constructor() {
    super(SceneKeys.Pause);
  }

  create(): void {
    this.dim = this.add.image(0, 0, TextureKeys.Pixel).setOrigin(0).setTint(0x000000).setAlpha(0.65);
    this.dim.setInteractive(); // swallow taps so nothing underneath reacts
    this.label = this.add
      .text(0, 0, '일시정지', { fontFamily: FONT_FAMILY, fontSize: '64px', color: Colors.text, fontStyle: 'bold' })
      .setOrigin(0.5);
    this.resumeButton = new Button(this, 0, 0, '계속하기', () => {
      this.scene.stop();
      this.scene.resume(SceneKeys.Battle);
    });
    this.lobbyButton = new Button(
      this,
      0,
      0,
      '로비로',
      () => {
        this.scene.stop(SceneKeys.Battle);
        this.scene.start(SceneKeys.Lobby);
      },
      { color: Colors.neutral },
    );
    this.bindLayout();
  }

  protected layout(width: number, height: number): void {
    const cx = width / 2;
    this.dim.setDisplaySize(width, height);
    this.label.setPosition(cx, height * 0.38);
    this.resumeButton.setPosition(cx, height * 0.52);
    this.lobbyButton.setPosition(cx, height * 0.52 + 140);
  }
}
