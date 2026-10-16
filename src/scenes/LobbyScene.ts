import Phaser from 'phaser';
import { ATLAS, formatCount, NUM_FONT } from '../art/atlas';
import { buildLobbyBackground, buildLogo, LOBBY_BG, LOBBY_HORIZON_Y, LOBBY_LOGO } from '../art/lobbyArt';
import { UNIT_FRAMES } from '../art/sprites';
import { audio } from '../audio/Audio';
import { Colors, DESIGN_HEIGHT, DESIGN_WIDTH, FONT_FAMILY, SceneKeys } from '../config';
import { setFrameCap } from '../core/frameRate';
import { save } from '../game/save';
import { suggestedUpgrade } from '../meta/shelter';
import { flags } from '../platform/flags';
import { getLevel, LEVELS } from '../sim/rules';
import { stageIntro, stageName, t } from '../i18n';
import { Button } from '../ui/Button';
import { Coach } from '../ui/Coach';
import { IconButton } from '../ui/IconButton';
import { BaseScene } from './BaseScene';
import { ShelterScene } from './ShelterScene';

/** Survivors walking away down the road behind the menu. */
const MARCHERS = 14;
/** Seconds for a marcher to walk from the bottom edge to the horizon. */
const MARCH_TIME = 16;
const EMBERS = 22;

/** Title, the stage card (browse unlocked stages; every stage with ?debug=1) and the start button. */
export class LobbyScene extends BaseScene {
  private bg!: Phaser.GameObjects.Image;
  private logo!: Phaser.GameObjects.Image;
  private subtitle!: Phaser.GameObjects.Text;
  private card!: Phaser.GameObjects.NineSlice;
  private stageNo!: Phaser.GameObjects.BitmapText;
  private stageName!: Phaser.GameObjects.Text;
  private stageInfo!: Phaser.GameObjects.Text;
  private bossIcon!: Phaser.GameObjects.Image;
  private prevButton!: IconButton;
  private nextButton!: IconButton;
  private startButton!: Button;
  private shelterButton!: Button;
  private shelterBadge!: Phaser.GameObjects.Image;
  private settingsButton!: IconButton;
  private shopButton!: IconButton;
  private debugNote!: Phaser.GameObjects.Text;
  private version!: Phaser.GameObjects.Text;
  /** Points at the shelter until the first building upgrade. */
  private coach!: Coach;
  private stage = 1;

  private marchers: Phaser.GameObjects.Image[] = [];
  /** Per marcher: progress 0 (bottom) → 1 (horizon), lane offset −1…1. */
  private marchT = new Float32Array(MARCHERS);
  private marchLane = new Float32Array(MARCHERS);
  private embers: Phaser.GameObjects.Image[] = [];
  /** Per ember: x, y, vx, vy, life left. */
  private emberState = new Float32Array(EMBERS * 5);
  /** Background placement, refreshed by layout(). */
  private bgScale = 1;
  private bgTop = 0;
  private roadX = 0;
  private viewW = DESIGN_WIDTH;
  private viewH = DESIGN_HEIGHT;
  private logoBaseY = 0;
  private clock = 0;

  constructor() {
    super(SceneKeys.Lobby);
  }

  create(): void {
    setFrameCap(this.game, 30);
    buildLobbyBackground(this);
    buildLogo(this);
    this.stage = Math.min(save.data.unlocked, LEVELS.length);
    this.clock = 0;

    this.bg = this.add.image(0, 0, LOBBY_BG).setOrigin(0.5, 0).setDepth(-10);
    this.marchers = [];
    for (let i = 0; i < MARCHERS; i++) {
      const frame = UNIT_FRAMES[i % 7 === 6 ? 3 : i % 5 === 4 ? 2 : i % 3 === 2 ? 1 : 0];
      this.marchers.push(this.add.image(0, 0, ATLAS, frame).setTint(0x8a6a62));
      this.marchT[i] = i / MARCHERS;
      this.marchLane[i] = ((i * 7) % 11) / 5 - 1;
    }
    this.embers = [];
    for (let i = 0; i < EMBERS; i++) {
      this.embers.push(this.add.image(0, 0, ATLAS, 'spark').setBlendMode(Phaser.BlendModes.ADD).setTint(0xff9a50).setDepth(-3));
      this.emberState[i * 5 + 4] = 0; // respawn on the first update
    }

    this.logo = this.add.image(0, 0, LOBBY_LOGO);
    this.subtitle = this.add
      .text(0, 0, t('title.subtitle'), { fontFamily: FONT_FAMILY, fontSize: '40px', color: Colors.accent, fontStyle: 'bold' })
      .setOrigin(0.5)
      .setShadow(0, 3, '#000000', 6, false, true);

    this.card = this.add.nineslice(0, 0, ATLAS, 'panel', 600, 300, 20, 20, 20, 20).setTint(0x14181e).setAlpha(0.9);
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
    this.startButton = new Button(this, 0, 0, t('lobby.start'), () => this.scene.start(SceneKeys.Battle, { stage: this.stage }), {
      width: 400,
      height: 120,
      fontSize: 48,
    });
    this.shelterButton = new Button(this, 0, 0, t('lobby.shelter'), () => this.scene.start(SceneKeys.Shelter), {
      width: 240,
      height: 120,
      fontSize: 38,
      color: 0x8a5a2a,
    });
    // Red dot when an upgrade is affordable or an hour of idle resources is waiting.
    this.shelterBadge = this.add.image(0, 0, ATLAS, 'circle').setTint(0xff3b3b).setScale(0.45).setVisible(ShelterScene.hasNews());
    this.settingsButton = new IconButton(this, 0, 0, 'i_gear', () => this.openSettings(), { size: 88 });
    this.shopButton = new IconButton(this, 0, 0, 'i_cart', () => this.openShop(), { size: 88 });
    // A supply crate bought in the shop can make an upgrade affordable.
    const onResume = () => this.shelterBadge.setVisible(ShelterScene.hasNews());
    this.events.on(Phaser.Scenes.Events.RESUME, onResume);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.events.off(Phaser.Scenes.Events.RESUME, onResume));
    this.debugNote = this.add
      .text(0, 0, flags.debug ? t('lobby.debugAll') : '', { fontFamily: FONT_FAMILY, fontSize: '22px', color: '#ff9f6b' })
      .setOrigin(0.5);
    this.version = this.add
      .text(0, 0, `v${__APP_VERSION__} · ${__BUILD_SHA__}`, { fontFamily: FONT_FAMILY, fontSize: '22px', color: Colors.textDim })
      .setOrigin(0.5, 1);

    this.coach = new Coach(this, 100);
    if (!save.data.tutorial.shelter && suggestedUpgrade(save.data)) this.coach.show(t('tut.shelterLobby'));
    this.debugNote.setVisible(!this.coach.visible);

    this.refresh();
    audio.playMusic('lobby');
    this.enter();
    this.bindLayout();
  }

  override update(_time: number, delta: number): void {
    const dt = Math.min(delta, 100) / 1000;
    this.clock += dt;
    this.logo.y = this.logoBaseY + Math.sin(this.clock * 1.4) * 4;
    this.stepMarchers(dt);
    this.stepEmbers(dt);
    if (this.coach.visible) {
      this.coach.tick(dt);
      this.coach.pointAt(this.shelterButton.x, this.shelterButton.y + 30);
    }
  }

  private get maxStage(): number {
    return flags.debug ? LEVELS.length : Math.min(save.data.unlocked, LEVELS.length);
  }

  private browse(dir: number): void {
    this.stage = Phaser.Math.Clamp(this.stage + dir, 1, this.maxStage);
    this.refresh();
  }

  private openSettings(): void {
    this.scene.pause();
    this.scene.launch(SceneKeys.Settings, { from: SceneKeys.Lobby });
  }

  private openShop(): void {
    this.scene.pause();
    this.scene.launch(SceneKeys.Shop, { from: SceneKeys.Lobby });
  }

  private refresh(): void {
    const level = getLevel(this.stage);
    this.stageNo.setText(String(level.id));
    this.stageName.setText(stageName(level));
    const best = save.data.best[level.id];
    const info: string[] = [];
    const intro = stageIntro(level);
    if (intro) info.push(t('lobby.new', { what: intro }));
    info.push(best !== undefined ? t('lobby.best', { n: formatCount(best) }) : t('lobby.notCleared'));
    this.stageInfo.setText(info.join('\n'));
    this.bossIcon.setVisible(level.id % 5 === 0);
    this.prevButton.setEnabled(this.stage > 1);
    this.nextButton.setEnabled(this.stage < this.maxStage);
  }

  /** Marchers walk toward the vanishing point, shrinking and fading, then loop back to the bottom. */
  private stepMarchers(dt: number): void {
    const horizon = this.bgTop + LOBBY_HORIZON_Y * this.bgScale;
    const bottom = this.viewH + 40;
    const span = bottom - horizon;
    for (let i = 0; i < MARCHERS; i++) {
      let t = this.marchT[i] + dt / MARCH_TIME;
      if (t >= 1) t -= 1;
      this.marchT[i] = t;
      // Perspective: distance shrinks quickly near the horizon.
      const near = (1 - t) * (1 - t);
      const sprite = this.marchers[i];
      sprite.x = this.roadX + this.marchLane[i] * near * 260 * this.bgScale;
      sprite.y = horizon + span * near + Math.sin((this.clock * 7 + i) * 1.3) * 2 * near;
      sprite.setScale(0.2 + near * 1.1);
      sprite.alpha = t > 0.85 ? (1 - t) / 0.15 : t < 0.04 ? t / 0.04 : 1;
      sprite.depth = -5 + near;
    }
  }

  /** Embers drift up from the burning city. */
  private stepEmbers(dt: number): void {
    const s = this.emberState;
    for (let i = 0; i < EMBERS; i++) {
      const o = i * 5;
      s[o + 4] -= dt;
      if (s[o + 4] <= 0) {
        s[o] = Math.random() * this.viewW;
        s[o + 1] = this.viewH * (0.55 + Math.random() * 0.5);
        s[o + 2] = (Math.random() - 0.3) * 30;
        s[o + 3] = -40 - Math.random() * 60;
        s[o + 4] = 4 + Math.random() * 5;
      }
      s[o] += s[o + 2] * dt + Math.sin(this.clock * 2 + i) * 10 * dt;
      s[o + 1] += s[o + 3] * dt;
      const ember = this.embers[i];
      ember.setPosition(s[o], s[o + 1]);
      ember.alpha = Math.min(1, s[o + 4] / 2) * 0.8;
      ember.setScale(0.35 + (i % 3) * 0.12);
    }
  }

  protected layout(width: number, height: number): void {
    const cx = width / 2;
    this.viewW = width;
    this.viewH = height;
    // Cover the screen; extra height on tall phones grows the sky upward.
    this.bgScale = Math.max(width / DESIGN_WIDTH, height / DESIGN_HEIGHT);
    this.bgTop = height - DESIGN_HEIGHT * this.bgScale;
    this.bg.setPosition(cx, this.bgTop).setScale(this.bgScale);
    this.roadX = cx;

    const logoY = Math.max(this.insets.top + 170, height * 0.17);
    this.logoBaseY = logoY;
    this.logo.setPosition(cx, logoY).setScale(Math.min(1, (width - 60) / 640));
    this.subtitle.setPosition(cx, logoY + 180);
    this.settingsButton.setPosition(width - 64, this.insets.top + 64);
    this.shopButton.setPosition(64, this.insets.top + 64);

    const cardY = Math.max(height * 0.5, logoY + 380);
    this.card.setPosition(cx, cardY);
    this.stageNo.setPosition(cx, cardY - 92);
    this.bossIcon.setPosition(cx + 70, cardY - 96);
    this.stageName.setPosition(cx, cardY - 24);
    this.stageInfo.setPosition(cx, cardY + 26);
    this.prevButton.setPosition(cx - 280, cardY + 210);
    this.nextButton.setPosition(cx + 280, cardY + 210);
    this.debugNote.setPosition(cx, cardY + 210);
    // Between the stage arrows, above the buttons.
    this.coach.textAt(cx, cardY + 210, 440);
    const buttonsY = Math.min(height - this.insets.bottom - 170, cardY + 340);
    this.shelterButton.setPosition(cx - 210, buttonsY);
    this.startButton.setPosition(cx + 120, buttonsY);
    this.shelterBadge.setPosition(cx - 210 + 108, buttonsY - 48);
    this.version.setPosition(cx, height - this.insets.bottom - 24);
  }
}
