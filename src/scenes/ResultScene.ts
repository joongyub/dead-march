import Phaser from 'phaser';
import { ATLAS, formatCount, NUM_FONT } from '../art/atlas';
import { audio } from '../audio/Audio';
import { Colors, FONT_FAMILY, SceneKeys } from '../config';
import { setFrameCap } from '../core/frameRate';
import type { BattleOutcome } from '../game/progress';
import { LEVELS } from '../sim/rules';
import { Button } from '../ui/Button';
import { BaseScene } from './BaseScene';

export interface ResultData {
  stage: number;
  won: boolean;
  power: number;
  kills: number;
  time: number;
  outcome: BattleOutcome | null;
}

const REWARD_ICONS = [
  { key: 'food', icon: 'i_food', tint: 0x9be07a },
  { key: 'scrap', icon: 'i_scrap', tint: 0xc9d3dc },
  { key: 'fuel', icon: 'i_fuel', tint: 0xffb44a },
] as const;

/** Win/lose panel over the paused battle: what happened, what was earned, and where to go next. */
export class ResultScene extends BaseScene {
  private dim!: Phaser.GameObjects.Image;
  private panel!: Phaser.GameObjects.NineSlice;
  private title!: Phaser.GameObjects.Image;
  private lines!: Phaser.GameObjects.Text;
  private rewardIcons: Phaser.GameObjects.Image[] = [];
  private rewardTexts: Phaser.GameObjects.BitmapText[] = [];
  private note!: Phaser.GameObjects.Text;
  private buttons: Button[] = [];
  private result!: ResultData;
  private shown = 0;

  constructor() {
    super(SceneKeys.Result);
  }

  create(data: ResultData): void {
    setFrameCap(this.game, 30);
    this.result = data;
    this.shown = 0;
    this.rewardIcons = [];
    this.rewardTexts = [];
    this.buttons = [];
    this.dim = this.add.image(0, 0, ATLAS, 'px').setOrigin(0).setTint(0x000000).setAlpha(0).setInteractive();
    this.tweens.add({ targets: this.dim, alpha: 0.7, duration: 200 });
    this.panel = this.add.nineslice(0, 0, ATLAS, 'panel', 600, 640, 20, 20, 20, 20).setTint(0x1a2028);
    this.title = this.add.image(0, 0, ATLAS, data.won ? 'w_win' : 'w_lose').setTint(data.won ? 0xffd25a : 0xff6b6b);

    const secs = Math.round(data.time);
    const time = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    const statLines = data.won
      ? [`남은 병력 ${formatCount(data.power)}`, `처치한 좀비 ${formatCount(data.kills)}`, `걸린 시간 ${time}`]
      : [`처치한 좀비 ${formatCount(data.kills)}`, `버틴 시간 ${time}`];
    this.lines = this.add
      .text(0, 0, statLines.join('\n'), { fontFamily: FONT_FAMILY, fontSize: '32px', color: Colors.text, align: 'center', lineSpacing: 12 })
      .setOrigin(0.5, 0);

    const reward = data.outcome?.reward;
    for (const r of REWARD_ICONS) {
      this.rewardIcons.push(this.add.image(0, 0, ATLAS, r.icon).setTint(r.tint).setVisible(!!reward));
      this.rewardTexts.push(this.add.bitmapText(0, 0, NUM_FONT, '+0', 40).setOrigin(0, 0.5).setVisible(!!reward));
    }

    let noteText = '';
    if (data.outcome?.firstClear && data.stage < LEVELS.length) noteText = `스테이지 ${data.stage + 1} 열림!`;
    else if (data.outcome?.firstClear) noteText = '모든 스테이지를 깼습니다!';
    else if (!data.won && data.stage >= 8) noteText = '피난처를 강화하면 더 강해져요';
    this.note = this.add
      .text(0, 0, noteText, { fontFamily: FONT_FAMILY, fontSize: '28px', color: Colors.accent, fontStyle: 'bold' })
      .setOrigin(0.5);

    const next = data.outcome?.nextStage ?? data.stage;
    if (data.won && data.stage > 0 && data.stage < LEVELS.length) {
      this.buttons.push(new Button(this, 0, 0, '다음 스테이지', () => this.startBattle(next), { width: 460 }));
    }
    this.buttons.push(
      new Button(this, 0, 0, '다시 하기', () => this.startBattle(data.stage), {
        width: 460,
        color: data.won ? Colors.neutral : Colors.primary,
      }),
    );
    this.buttons.push(new Button(this, 0, 0, '로비로', () => this.toLobby(), { width: 460, color: Colors.neutral }));

    // Panel slides up a little as it appears.
    const items = [this.panel, this.title, this.lines, this.note, ...this.rewardIcons, ...this.rewardTexts, ...this.buttons];
    for (const item of items) item.setAlpha(0);
    this.tweens.add({ targets: items, alpha: 1, duration: 220, delay: 80 });
    this.tweens.add({ targets: this.title, scale: { from: 1.6, to: 1 }, duration: 320, ease: 'Back.Out', delay: 80 });

    this.bindLayout();
  }

  override update(_time: number, delta: number): void {
    // Rewards count up over half a second.
    const reward = this.result.outcome?.reward;
    if (!reward || this.shown >= 1) return;
    if (this.shown === 0) audio.play('coin');
    this.shown = Math.min(1, this.shown + delta / 600);
    if (this.shown >= 1) audio.play('coin', 1, 500);
    const values = [reward.food, reward.scrap, reward.fuel];
    for (let i = 0; i < 3; i++) this.rewardTexts[i].setText(`+${Math.round(values[i] * this.shown)}`);
  }

  protected layout(width: number, height: number): void {
    const cx = width / 2;
    const top = Math.max(this.insets.top + 40, height / 2 - 520);
    this.dim.setDisplaySize(width, height);
    const panelH = 560 + (this.buttons.length - 1) * 124;
    this.panel.setPosition(cx, top + panelH / 2).setSize(620, panelH);
    this.title.setPosition(cx, top + 90);
    this.lines.setPosition(cx, top + 170);
    const rewardY = top + 360;
    for (let i = 0; i < 3; i++) {
      const x = cx - 230 + i * 170;
      this.rewardIcons[i].setPosition(x, rewardY);
      this.rewardTexts[i].setPosition(x + 32, rewardY + 2);
    }
    this.note.setPosition(cx, top + 430);
    for (let i = 0; i < this.buttons.length; i++) this.buttons[i].setPosition(cx, top + 520 + i * 124);
  }

  private startBattle(stage: number): void {
    this.scene.stop();
    this.scene.get(SceneKeys.Battle).scene.restart({ stage });
  }

  private toLobby(): void {
    this.scene.stop(SceneKeys.Battle);
    this.scene.start(SceneKeys.Lobby);
  }
}
