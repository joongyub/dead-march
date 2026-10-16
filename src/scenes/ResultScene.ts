import Phaser from 'phaser';
import { ATLAS, formatCount, NUM_FONT } from '../art/atlas';
import { audio } from '../audio/Audio';
import { Colors, FONT_FAMILY, SceneKeys } from '../config';
import { setFrameCap } from '../core/frameRate';
import type { BattleOutcome, Reward } from '../game/progress';
import { grantAdBonus, hasNoAds } from '../game/shop';
import { suggestedUpgrade, RESOURCE_IDS } from '../meta/shelter';
import { save } from '../game/save';
import { LEVELS } from '../sim/rules';
import { t } from '../i18n';
import { services } from '../services';
import { RESOURCE_ICON } from '../ui/resourceIcons';
import { Button } from '../ui/Button';
import { Coach } from '../ui/Coach';
import { BaseScene } from './BaseScene';

export interface ResultData {
  stage: number;
  won: boolean;
  power: number;
  kills: number;
  time: number;
  outcome: BattleOutcome | null;
}

const REWARD_ICONS = RESOURCE_IDS.map((r) => RESOURCE_ICON[r]);

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
  /** Finger on the shelter button until the first upgrade is bought. */
  private coach!: Coach;
  private shelterButton: Button | null = null;
  private result!: ResultData;
  /** Reward count-up: from `countFrom` to `countTo` as `shown` goes 0 → 1. */
  private shown = 0;
  private readonly countFrom = [0, 0, 0];
  private readonly countTo = [0, 0, 0];
  /** "Watch an ad, double the reward" (free after remove-ads); used once. */
  private adButton: Button | null = null;
  private adState: 'ready' | 'busy' | 'done' = 'ready';
  private noteText = '';

  constructor() {
    super(SceneKeys.Result);
  }

  create(data: ResultData): void {
    setFrameCap(this.game, 30);
    this.result = data;
    this.shown = 0;
    this.adButton = null;
    this.adState = 'ready';
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
      ? [t('result.powerLeft', { n: formatCount(data.power) }), t('result.kills', { n: formatCount(data.kills) }), t('result.time', { t: time })]
      : [t('result.kills', { n: formatCount(data.kills) }), t('result.survived', { t: time })];
    this.lines = this.add
      .text(0, 0, statLines.join('\n'), { fontFamily: FONT_FAMILY, fontSize: '32px', color: Colors.text, align: 'center', lineSpacing: 12 })
      .setOrigin(0.5, 0);

    const reward = data.outcome?.reward;
    this.countFrom.fill(0);
    if (reward) this.setCountTo(reward);
    for (const r of REWARD_ICONS) {
      this.rewardIcons.push(this.add.image(0, 0, ATLAS, r.icon).setTint(r.tint).setVisible(!!reward));
      this.rewardTexts.push(this.add.bitmapText(0, 0, NUM_FONT, '+0', 40).setOrigin(0, 0.5).setVisible(!!reward));
    }

    let noteText = '';
    if (data.outcome?.firstClear && data.stage < LEVELS.length) noteText = t('result.unlocked', { n: data.stage + 1 });
    else if (data.outcome?.firstClear) noteText = t('result.allClear');
    else if (!data.won && data.stage >= 8) noteText = t('result.upgradeHint');
    this.noteText = noteText;
    this.note = this.add
      .text(0, 0, noteText, { fontFamily: FONT_FAMILY, fontSize: '28px', color: Colors.accent, fontStyle: 'bold' })
      .setOrigin(0.5);

    // With an upgrade in reach, the shelter comes first after a loss, and after the first battles until
    // the player has bought an upgrade once.
    const canUpgrade = data.stage > 0 && suggestedUpgrade(save.data) !== null;
    const shelterFirst = canUpgrade && (!data.won || !save.data.tutorial.shelter);
    const next = data.outcome?.nextStage ?? data.stage;
    const nextButton =
      data.won && data.stage > 0 && data.stage < LEVELS.length
        ? new Button(this, 0, 0, t('result.next'), () => this.startBattle(next), {
            width: 460,
            color: shelterFirst ? Colors.neutral : Colors.primary,
          })
        : null;
    const retry = new Button(this, 0, 0, t('common.retry'), () => this.startBattle(data.stage), {
      width: 460,
      color: data.won || shelterFirst ? Colors.neutral : Colors.primary,
    });
    const shelter = new Button(this, 0, 0, canUpgrade ? t('result.shelterUpgrade') : t('result.shelter'), () => this.toShelter(), {
      width: 460,
      color: shelterFirst ? Colors.primary : Colors.neutral,
    });
    if (shelterFirst) this.buttons.push(shelter);
    // Doubling the reward sits right under the reward (after the shelter while that lesson is on).
    if (reward && data.stage > 0 && reward.food + reward.scrap + reward.fuel > 0) {
      this.adButton = new Button(this, 0, 0, this.adLabel(), () => void this.doubleReward(), { width: 460, color: 0xb8862b, fontSize: 36 });
      this.buttons.push(this.adButton);
    }
    if (nextButton) this.buttons.push(nextButton);
    this.buttons.push(retry);
    if (data.stage > 0 && !shelterFirst) this.buttons.push(shelter);
    if (data.stage === 0) shelter.destroy();
    this.shelterButton = data.stage > 0 ? shelter : null;
    this.coach = new Coach(this, 10);
    if (canUpgrade && !save.data.tutorial.shelter) this.coach.show('');
    this.buttons.push(new Button(this, 0, 0, t('common.lobby'), () => this.toLobby(), { width: 460, color: Colors.neutral }));

    // Panel slides up a little as it appears.
    const items = [this.panel, this.title, this.lines, this.note, ...this.rewardIcons, ...this.rewardTexts, ...this.buttons];
    for (const item of items) item.setAlpha(0);
    this.tweens.add({ targets: items, alpha: 1, duration: 220, delay: 80 });
    this.tweens.add({ targets: this.title, scale: { from: 1.6, to: 1 }, duration: 320, ease: 'Back.Out', delay: 80 });

    this.bindLayout();
  }

  override update(_time: number, delta: number): void {
    if (this.coach.visible && this.shelterButton) {
      this.coach.tick(delta / 1000);
      this.coach.pointAt(this.shelterButton.x + 170, this.shelterButton.y + 20);
    }
    // Rewards count up over half a second.
    const reward = this.result.outcome?.reward;
    if (!reward || this.shown >= 1) return;
    if (this.shown === 0) audio.play('coin');
    this.shown = Math.min(1, this.shown + delta / 600);
    if (this.shown >= 1) audio.play('coin', 1, 500);
    for (let i = 0; i < 3; i++) {
      this.rewardTexts[i].setText(`+${Math.round(this.countFrom[i] + (this.countTo[i] - this.countFrom[i]) * this.shown)}`);
    }
  }

  private setCountTo(r: Reward): void {
    this.countTo[0] = r.food;
    this.countTo[1] = r.scrap;
    this.countTo[2] = r.fuel;
  }

  private adLabel(): string {
    return hasNoAds() ? t('result.doubleFree') : t('result.doubleAd');
  }

  private async doubleReward(): Promise<void> {
    const reward = this.result.outcome?.reward;
    if (!reward || this.adState !== 'ready' || !this.adButton) return;
    this.adState = 'busy';
    const free = hasNoAds();
    if (!free) this.adButton.setLabel(t('result.adLoading'));
    const watched = free || (await services.ads.showRewarded('result_double').catch(() => false));
    if (!watched) {
      this.adState = 'ready';
      if (this.scene.isActive()) {
        this.adButton.setLabel(this.adLabel());
        this.note.setText(t('result.adMissed'));
      }
      return;
    }
    // Granted even if the screen changed meanwhile: the player did watch the ad.
    const bonus = grantAdBonus(reward);
    services.analytics.log('ad_reward', { placement: 'result_double', free });
    this.adState = 'done';
    if (!this.scene.isActive()) return;
    this.adButton.setLabel(t('result.doubled')).setAlpha(0.55);
    this.note.setText(this.noteText);
    // Count up again from the first reward to the doubled one.
    for (let i = 0; i < 3; i++) this.countFrom[i] = this.countTo[i];
    this.setCountTo({ food: reward.food + bonus.food, scrap: reward.scrap + bonus.scrap, fuel: reward.fuel + bonus.fuel });
    this.shown = 0;
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

  override onBack(): boolean {
    this.toLobby();
    return true;
  }

  private toShelter(): void {
    this.scene.stop(SceneKeys.Battle);
    this.scene.start(SceneKeys.Shelter);
  }

  private toLobby(): void {
    this.scene.stop(SceneKeys.Battle);
    this.scene.start(SceneKeys.Lobby);
  }
}
