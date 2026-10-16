import Phaser from 'phaser';
import { ATLAS, formatCount, NUM_FONT } from '../art/atlas';
import { Colors, FONT_FAMILY, SceneKeys } from '../config';
import { save } from '../game/save';
import { flags } from '../platform/flags';
import { getLevel, LEVELS } from '../sim/rules';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { BaseScene } from './BaseScene';

/** Title, the stage card (browse unlocked stages; every stage with ?debug=1) and the start button. */
export class LobbyScene extends BaseScene {
  private bg!: Phaser.GameObjects.TileSprite;
  private title!: Phaser.GameObjects.Text;
  private subtitle!: Phaser.GameObjects.Text;
  private card!: Phaser.GameObjects.NineSlice;
  private stageNo!: Phaser.GameObjects.BitmapText;
  private stageName!: Phaser.GameObjects.Text;
  private stageInfo!: Phaser.GameObjects.Text;
  private bossIcon!: Phaser.GameObjects.Image;
  private prevButton!: IconButton;
  private nextButton!: IconButton;
  private startButton!: Button;
  private debugNote!: Phaser.GameObjects.Text;
  private version!: Phaser.GameObjects.Text;
  private stage = 1;

  constructor() {
    super(SceneKeys.Lobby);
  }

  create(): void {
    this.stage = Math.min(save.data.unlocked, LEVELS.length);
    this.bg = this.add.tileSprite(0, 0, 1, 1, 'ground').setOrigin(0).setAlpha(0.5);
    this.title = this.add
      .text(0, 0, 'DEAD MARCH', { fontFamily: FONT_FAMILY, fontSize: '96px', color: Colors.text, fontStyle: 'bold' })
      .setOrigin(0.5);
    this.subtitle = this.add
      .text(0, 0, '데드 마치', { fontFamily: FONT_FAMILY, fontSize: '44px', color: Colors.accent, fontStyle: 'bold' })
      .setOrigin(0.5);

    this.card = this.add.nineslice(0, 0, ATLAS, 'panel', 600, 300, 20, 20, 20, 20).setTint(0x1c232b).setAlpha(0.92);
    this.stageNo = this.add.bitmapText(0, 0, NUM_FONT, '1', 80).setOrigin(0.5);
    this.stageName = this.add
      .text(0, 0, '', { fontFamily: FONT_FAMILY, fontSize: '40px', color: Colors.text, fontStyle: 'bold' })
      .setOrigin(0.5);
    this.stageInfo = this.add
      .text(0, 0, '', { fontFamily: FONT_FAMILY, fontSize: '26px', color: Colors.textDim, align: 'center', lineSpacing: 8 })
      .setOrigin(0.5, 0);
    this.bossIcon = this.add.image(0, 0, ATLAS, 'i_boss').setTint(0xff6060).setScale(0.8);
    this.prevButton = new IconButton(this, 0, 0, 'i_left', () => this.browse(-1), { size: 96 });
    this.nextButton = new IconButton(this, 0, 0, 'i_right', () => this.browse(1), { size: 96 });
    this.startButton = new Button(this, 0, 0, '출격', () => this.scene.start(SceneKeys.Battle, { stage: this.stage }), {
      width: 420,
      height: 120,
      fontSize: 48,
    });
    this.debugNote = this.add
      .text(0, 0, flags.debug ? '개발용: 모든 스테이지 선택 가능' : '', { fontFamily: FONT_FAMILY, fontSize: '22px', color: '#ff9f6b' })
      .setOrigin(0.5);
    this.version = this.add
      .text(0, 0, `v0.2.0 · ${__BUILD_SHA__}`, { fontFamily: FONT_FAMILY, fontSize: '22px', color: Colors.textDim })
      .setOrigin(0.5, 1);

    this.refresh();
    this.bindLayout();
  }

  private get maxStage(): number {
    return flags.debug ? LEVELS.length : Math.min(save.data.unlocked, LEVELS.length);
  }

  private browse(dir: number): void {
    this.stage = Phaser.Math.Clamp(this.stage + dir, 1, this.maxStage);
    this.refresh();
  }

  private refresh(): void {
    const level = getLevel(this.stage);
    this.stageNo.setText(String(level.id));
    this.stageName.setText(level.name);
    const best = save.data.best[level.id];
    const info: string[] = [];
    if (level.intro) info.push(`새로 등장: ${level.intro}`);
    info.push(best !== undefined ? `최고 기록: 병력 ${formatCount(best)} 남기고 클리어` : '아직 깨지 않은 스테이지');
    this.stageInfo.setText(info.join('\n'));
    this.bossIcon.setVisible(level.id % 5 === 0);
    this.prevButton.setEnabled(this.stage > 1);
    this.nextButton.setEnabled(this.stage < this.maxStage);
  }

  protected layout(width: number, height: number): void {
    const cx = width / 2;
    this.bg.setSize(width, height);
    const titleY = Math.max(this.insets.top + 110, height * 0.2);
    this.title.setPosition(cx, titleY);
    this.subtitle.setPosition(cx, titleY + 90);
    const cardY = height * 0.5;
    this.card.setPosition(cx, cardY);
    this.stageNo.setPosition(cx, cardY - 92);
    this.bossIcon.setPosition(cx + 70, cardY - 96);
    this.stageName.setPosition(cx, cardY - 24);
    this.stageInfo.setPosition(cx, cardY + 26);
    this.prevButton.setPosition(cx - 300 + 20, cardY + 210);
    this.nextButton.setPosition(cx + 300 - 20, cardY + 210);
    this.startButton.setPosition(cx, Math.min(height * 0.74, cardY + 330));
    this.debugNote.setPosition(cx, cardY + 210);
    this.version.setPosition(cx, height - this.insets.bottom - 24);
  }
}
