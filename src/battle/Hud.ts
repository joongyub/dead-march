import Phaser from 'phaser';
import { ATLAS, formatCount, NUM_FONT } from '../art/atlas';
import { UNIT_FRAMES } from '../art/sprites';
import { Colors, FONT_FAMILY } from '../config';
import type { Insets } from '../platform/safeArea';
import type { BattleSim } from '../sim/BattleSim';
import { TIER_COUNT } from '../sim/types';
import { IconButton } from '../ui/IconButton';
import { Depth } from './depth';

const BAR_H = 16;

/**
 * Battle HUD: stage name and progress (or boss health), unit counts per tier, the army size above the
 * crowd, and the pause button. Numbers use the bitmap font and only change text when the value changes.
 */
export class Hud {
  private readonly band: Phaser.GameObjects.Image;
  private readonly title: Phaser.GameObjects.Text;
  private readonly barBg: Phaser.GameObjects.Image;
  private readonly barFill: Phaser.GameObjects.Image;
  private readonly barIcon: Phaser.GameObjects.Image;
  private readonly marker: Phaser.GameObjects.Image;
  private readonly tierIcons: Phaser.GameObjects.Image[] = [];
  private readonly tierTexts: Phaser.GameObjects.BitmapText[] = [];
  private readonly tierValues = new Int32Array(TIER_COUNT).fill(-1);
  private readonly powerBg: Phaser.GameObjects.NineSlice;
  private readonly powerIcon: Phaser.GameObjects.Image;
  private readonly powerText: Phaser.GameObjects.BitmapText;
  private powerValue = -1;
  private powerPop = 0;
  private bossMode = false;
  private barX = 0;
  private barW = 300;
  readonly pauseButton: IconButton;

  constructor(
    scene: Phaser.Scene,
    stageLabel: string,
    private readonly bossLabel: string,
    onPause: () => void,
  ) {
    // Dark band behind the top HUD so gates and zombies scrolling underneath never hide the numbers.
    this.band = scene.add.image(0, 0, ATLAS, 'px').setOrigin(0).setTint(0x07090c).setAlpha(0.6).setDepth(Depth.Hud);
    this.title = scene.add
      .text(0, 0, stageLabel, { fontFamily: FONT_FAMILY, fontSize: '28px', color: Colors.text, fontStyle: 'bold' })
      .setShadow(0, 2, '#000', 4, false, true)
      .setDepth(Depth.HudText);
    this.barBg = scene.add.image(0, 0, ATLAS, 'px').setOrigin(0, 0.5).setTint(0x000000).setAlpha(0.5).setDepth(Depth.Hud);
    this.barFill = scene.add.image(0, 0, ATLAS, 'px').setOrigin(0, 0.5).setTint(Colors.progress).setDepth(Depth.Hud);
    this.barIcon = scene.add.image(0, 0, ATLAS, 'i_boss').setScale(0.75).setTint(0xff5a5a).setDepth(Depth.Hud);
    this.marker = scene.add.image(0, 0, ATLAS, 'circle').setScale(0.36).setTint(0x4fc3ff).setDepth(Depth.Hud);
    for (let i = 0; i < TIER_COUNT; i++) {
      this.tierIcons.push(scene.add.image(0, 0, ATLAS, UNIT_FRAMES[i]).setScale(i === 3 ? 0.42 : 0.8).setDepth(Depth.Hud));
      this.tierTexts.push(scene.add.bitmapText(0, 0, NUM_FONT, '0', 30).setOrigin(0, 0.5).setDepth(Depth.Hud));
    }
    this.powerBg = scene.add.nineslice(0, 0, ATLAS, 'pill', 140, 56, 28, 28, 0, 0).setTint(0x0b0f14).setAlpha(0.7).setDepth(Depth.Labels);
    this.powerIcon = scene.add.image(0, 0, ATLAS, 'i_people').setScale(0.62).setTint(0x8fd8ff).setDepth(Depth.Labels);
    this.powerText = scene.add.bitmapText(0, 0, NUM_FONT, '0', 44).setOrigin(0, 0.5).setDepth(Depth.Labels);
    this.pauseButton = new IconButton(scene, 0, 0, 'i_pause', onPause, { size: 84 });
    this.pauseButton.setDepth(Depth.Hud);
  }

  layout(width: number, _height: number, insets: Insets): void {
    const top = insets.top + 16;
    this.band.setDisplaySize(width, top + 136);
    this.pauseButton.setPosition(width - 24 - 42, top + 42);
    this.barX = 28;
    this.barW = width - 28 - 130 - 40;
    this.title.setPosition(this.barX, top);
    this.barBg.setPosition(this.barX, top + 62).setDisplaySize(this.barW, BAR_H);
    this.barFill.setPosition(this.barX, top + 62);
    this.barIcon.setPosition(this.barX + this.barW + 22, top + 62);
    const rowY = top + 108;
    for (let i = 0; i < TIER_COUNT; i++) {
      const x = this.barX + 18 + i * 118;
      this.tierIcons[i].setPosition(x, rowY);
      this.tierTexts[i].setPosition(x + 26, rowY + 2);
    }
  }

  /** Where the HUD shows tier `i` (the tutorial points at it). */
  tierIconAt(i: number): Phaser.GameObjects.Image {
    return this.tierIcons[i];
  }

  showBoss(): void {
    this.bossMode = true;
    this.title.setText(this.bossLabel).setColor('#ff8a8a');
    this.barFill.setTint(0xe5383b);
    this.marker.setVisible(false);
  }

  /** (pillX, pillY): where the army size goes, just above the army on screen. */
  update(dt: number, sim: BattleSim, pillX: number, pillY: number): void {
    // Progress along the road, or the boss's remaining health.
    const frac = this.bossMode
      ? Math.max(0, sim.boss.hp / sim.boss.hp0)
      : Math.min(1, sim.distance / sim.level.length);
    this.barFill.setDisplaySize(Math.max(1, this.barW * frac), BAR_H);
    if (!this.bossMode) this.marker.setPosition(this.barX + this.barW * frac, this.barBg.y);

    const counts = sim.army.counts;
    for (let i = 0; i < TIER_COUNT; i++) {
      if (counts[i] === this.tierValues[i]) continue;
      this.tierValues[i] = counts[i];
      this.tierTexts[i].setText(formatCount(counts[i]));
      const on = counts[i] > 0;
      this.tierIcons[i].setAlpha(on ? 1 : 0.3);
      this.tierTexts[i].setAlpha(on ? 1 : 0.35);
    }

    const power = sim.army.power;
    if (power !== this.powerValue) {
      if (this.powerValue >= 0) this.powerPop = 1;
      this.powerValue = power;
      this.powerText.setText(formatCount(power));
      this.powerBg.setSize(this.powerText.width + 92, 56);
    }
    if (this.powerPop > 0) this.powerPop = Math.max(0, this.powerPop - dt * 5);
    const visible = power > 0;
    const y = pillY;
    const w = this.powerBg.width;
    const s = 1 + this.powerPop * 0.25;
    this.powerBg.setPosition(pillX, y).setScale(s).setVisible(visible);
    this.powerIcon.setPosition(pillX - w / 2 + 34 * s, y).setVisible(visible);
    this.powerText.setPosition(pillX - w / 2 + 62 * s, y + 2).setScale(s).setVisible(visible);
  }
}
