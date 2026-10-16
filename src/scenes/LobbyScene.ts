import Phaser from 'phaser';
import { Colors, FONT_FAMILY, SceneKeys, TextureKeys } from '../config';
import { Button } from '../ui/Button';
import { BaseScene } from './BaseScene';

export class LobbyScene extends BaseScene {
  private bg!: Phaser.GameObjects.TileSprite;
  private title!: Phaser.GameObjects.Text;
  private subtitle!: Phaser.GameObjects.Text;
  private tagline!: Phaser.GameObjects.Text;
  private startButton!: Button;
  private version!: Phaser.GameObjects.Text;

  constructor() {
    super(SceneKeys.Lobby);
  }

  create(): void {
    this.bg = this.add.tileSprite(0, 0, 1, 1, TextureKeys.Ground).setOrigin(0).setAlpha(0.5);
    this.title = this.add
      .text(0, 0, 'DEAD MARCH', { fontFamily: FONT_FAMILY, fontSize: '96px', color: Colors.text, fontStyle: 'bold' })
      .setOrigin(0.5);
    this.subtitle = this.add
      .text(0, 0, '데드 마치', { fontFamily: FONT_FAMILY, fontSize: '44px', color: Colors.accent, fontStyle: 'bold' })
      .setOrigin(0.5);
    this.tagline = this.add
      .text(0, 0, '생존자를 이끌고 좀비 떼를 뚫어라', { fontFamily: FONT_FAMILY, fontSize: '30px', color: Colors.textDim })
      .setOrigin(0.5);
    this.startButton = new Button(this, 0, 0, '출격', () => this.scene.start(SceneKeys.Battle), {
      width: 420,
      height: 120,
      fontSize: 48,
    });
    this.version = this.add
      .text(0, 0, `v0.1.0 · ${__BUILD_SHA__}`, { fontFamily: FONT_FAMILY, fontSize: '22px', color: Colors.textDim })
      .setOrigin(0.5, 1);

    this.bindLayout();
  }

  protected layout(width: number, height: number): void {
    const cx = width / 2;
    this.bg.setSize(width, height);
    this.title.setPosition(cx, height * 0.3);
    this.subtitle.setPosition(cx, height * 0.3 + 90);
    this.tagline.setPosition(cx, height * 0.3 + 150);
    this.startButton.setPosition(cx, height * 0.68);
    this.version.setPosition(cx, height - this.insets.bottom - 24);
  }
}
