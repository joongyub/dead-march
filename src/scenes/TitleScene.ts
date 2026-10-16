import Phaser from 'phaser';
import { buildLobbyBackground, buildLogo, LOBBY_BG, LOBBY_LOGO } from '../art/lobbyArt';
import { audio } from '../audio/Audio';
import { Colors, DESIGN_HEIGHT, DESIGN_WIDTH, FONT_FAMILY, SceneKeys } from '../config';
import { setFrameCap } from '../core/frameRate';
import { t } from '../i18n';
import { appReady } from '../platform/app';
import { BaseScene } from './BaseScene';

/** First screen: logo and "tap to start". The tap also lets the browser start sound. */
export class TitleScene extends BaseScene {
  private bg!: Phaser.GameObjects.Image;
  private logo!: Phaser.GameObjects.Image;
  private subtitle!: Phaser.GameObjects.Text;
  private tap!: Phaser.GameObjects.Text;
  private version!: Phaser.GameObjects.Text;
  private clock = 0;
  private leaving = false;

  constructor() {
    super(SceneKeys.Title);
  }

  create(): void {
    setFrameCap(this.game, 30);
    buildLobbyBackground(this);
    buildLogo(this);
    this.clock = 0;
    this.leaving = false;
    this.bg = this.add.image(0, 0, LOBBY_BG).setOrigin(0.5, 0);
    this.logo = this.add.image(0, 0, LOBBY_LOGO);
    this.subtitle = this.add
      .text(0, 0, t('title.subtitle'), { fontFamily: FONT_FAMILY, fontSize: '44px', color: Colors.accent, fontStyle: 'bold' })
      .setOrigin(0.5)
      .setShadow(0, 3, '#000000', 6, false, true);
    this.tap = this.add
      .text(0, 0, t('title.tap'), { fontFamily: FONT_FAMILY, fontSize: '40px', color: Colors.text, fontStyle: 'bold' })
      .setOrigin(0.5)
      .setShadow(0, 3, '#000000', 8, false, true);
    this.version = this.add
      .text(0, 0, `v${__APP_VERSION__}`, { fontFamily: FONT_FAMILY, fontSize: '22px', color: Colors.textDim })
      .setOrigin(0.5, 1);
    this.input.once(Phaser.Input.Events.POINTER_UP, () => this.start());
    this.enter();
    this.bindLayout();
    // The app's splash screen lifts once the title has actually drawn.
    this.game.events.once(Phaser.Core.Events.POST_RENDER, appReady);
  }

  override update(_time: number, delta: number): void {
    this.clock += delta / 1000;
    this.tap.setAlpha(0.55 + Math.sin(this.clock * 3.2) * 0.45);
  }

  private start(): void {
    if (this.leaving) return;
    this.leaving = true;
    audio.unlock();
    audio.play('click');
    this.scene.start(SceneKeys.Lobby);
  }

  protected layout(width: number, height: number): void {
    const cx = width / 2;
    const scale = Math.max(width / DESIGN_WIDTH, height / DESIGN_HEIGHT);
    this.bg.setPosition(cx, height - DESIGN_HEIGHT * scale).setScale(scale);
    const logoY = Math.max(this.insets.top + 200, height * 0.3);
    this.logo.setPosition(cx, logoY).setScale(Math.min(1.08, (width - 40) / 640));
    this.subtitle.setPosition(cx, logoY + 200);
    this.tap.setPosition(cx, height * 0.78);
    this.version.setPosition(cx, height - this.insets.bottom - 24);
  }
}
