import Phaser from 'phaser';
import { ATLAS, formatCount, NUM_FONT } from '../art/atlas';
import { refreshCanvasTexture } from '../art/canvasTexture';
import {
  BUILDING_SPOTS,
  buildingOrigin,
  buildingTier,
  buildShelterBackground,
  CAMPFIRE,
  drawBuilding,
  ensureBuildingTexture,
  SHELTER_BG,
  SHELTER_BG_H,
  SHELTER_BUILDINGS,
} from '../art/shelterArt';
import { audio } from '../audio/Audio';
import { Colors, DESIGN_HEIGHT, DESIGN_WIDTH, FONT_FAMILY, SceneKeys } from '../config';
import { setFrameCap } from '../core/frameRate';
import { save } from '../game/save';
import { buildingDesc, buildingName, resourceName, t } from '../i18n';
import {
  BUILDING_IDS,
  canAfford,
  suggestedUpgrade,
  collectIdle,
  effectAt,
  guardClock,
  idlePending,
  idleRates,
  levelOf,
  maxLevel,
  nextCost,
  RESOURCE_IDS,
  upgrade,
  type BuildingEffect,
  type BuildingId,
  type ResourceId,
} from '../meta/shelter';
import { vibrate } from '../platform/haptics';
import { LEVELS } from '../sim/rules';
import { Button } from '../ui/Button';
import { Coach } from '../ui/Coach';
import { IconButton } from '../ui/IconButton';
import { RESOURCE_ICON } from '../ui/resourceIcons';
import { BaseScene } from './BaseScene';

/** Draw order: buildings and people sort by their y (0…~1800); everything below sits above them. */
const D = { labels: 5000, bubble: 5100, hud: 5200, float: 5500, modalDim: 6000, modal: 6001, coach: 6100 } as const;

/** One line describing a level's effect, for the upgrade window. */
export function effectText(id: BuildingId, e: BuildingEffect): string {
  switch (id) {
    case 'wall':
      return t('effect.wall', { n: e.startBonus ?? 0 });
    case 'armory':
      return t('effect.armory', { n: Math.round(((e.dpsMultiplier ?? 1) - 1) * 100) });
    case 'garage':
      return t('effect.garage', { n: Math.round((e.mergeBonus ?? 0) * 100) });
    case 'farm':
      return t('effect.farm', { n: e.foodPerHour ?? 0 });
    case 'radio':
      return t('effect.radio', { s: e.scrapPerHour ?? 0, f: e.fuelPerHour ?? 0 });
  }
}

interface BuildingView {
  id: BuildingId;
  image: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  arrow: Phaser.GameObjects.Image;
  tier: number;
}

interface CostSlot {
  icon: Phaser.GameObjects.Image;
  text: Phaser.GameObjects.BitmapText;
}

const SITTERS = 6;
const SPARKS = 10;

/**
 * The shelter: spend battle resources on five buildings, collect what piled up while away.
 * Mostly still, so it runs at 30fps.
 */
export class ShelterScene extends BaseScene {
  private bg!: Phaser.GameObjects.Image;
  private views: BuildingView[] = [];
  private fireGlow!: Phaser.GameObjects.Image;
  private sitters: Phaser.GameObjects.Image[] = [];
  private sparks: Phaser.GameObjects.Image[] = [];
  private sparkState = new Float32Array(SPARKS * 4);
  private resBg: Phaser.GameObjects.NineSlice[] = [];
  private resIcons: Phaser.GameObjects.Image[] = [];
  private resTexts: Phaser.GameObjects.BitmapText[] = [];
  private title!: Phaser.GameObjects.Text;
  private idleBubble!: Phaser.GameObjects.Container;
  private idleText!: Phaser.GameObjects.Text;
  private startButton!: Button;
  private homeButton!: IconButton;

  // Upgrade window.
  private modal!: Phaser.GameObjects.Container;
  private modalDim!: Phaser.GameObjects.Image;
  private modalTitle!: Phaser.GameObjects.Text;
  private modalDesc!: Phaser.GameObjects.Text;
  private modalEffect!: Phaser.GameObjects.Text;
  private modalCost: CostSlot[] = [];
  private modalButton!: Button;
  private modalMax!: Phaser.GameObjects.Text;
  private selected: BuildingId | null = null;
  /** First-upgrade lesson: finger on a building, then on the upgrade button. */
  private coach!: Coach;

  private originY = 0;
  private clock = 0;
  private refreshTimer = 0;

  constructor() {
    super(SceneKeys.Shelter);
  }

  create(): void {
    setFrameCap(this.game, 30);
    buildShelterBackground(this);
    const tex = ensureBuildingTexture(this);
    this.views = [];
    this.sitters = [];
    this.sparks = [];
    this.resBg = [];
    this.resIcons = [];
    this.resTexts = [];
    this.modalCost = [];
    this.selected = null;
    this.clock = 0;

    if (guardClock(save.data.idle, Date.now())) save.commit();

    this.bg = this.add.image(0, 0, SHELTER_BG).setOrigin(0.5, 0.5);

    // Campfire with survivors sitting around it.
    this.fireGlow = this.add.image(0, 0, ATLAS, 'soft').setBlendMode(Phaser.BlendModes.ADD).setTint(0xff8a3a);
    for (let i = 0; i < SITTERS; i++) {
      this.sitters.push(this.add.image(0, 0, ATLAS, i === 2 ? 'u1' : 'u0').setScale(1.1));
    }
    for (let i = 0; i < SPARKS; i++) {
      this.sparks.push(this.add.image(0, 0, ATLAS, 'spark').setBlendMode(Phaser.BlendModes.ADD).setTint(0xffb060));
    }

    for (const id of BUILDING_IDS) {
      const tier = buildingTier(levelOf(save.data.buildings, id));
      drawBuilding(tex, id, tier);
      const origin = buildingOrigin(id);
      const image = this.add.image(0, 0, SHELTER_BUILDINGS, id).setOrigin(origin.x, origin.y);
      image.setInteractive({ useHandCursor: true, pixelPerfect: false });
      image.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.openModal(id));
      const label = this.add
        .text(0, 0, '', { fontFamily: FONT_FAMILY, fontSize: '26px', color: Colors.text, fontStyle: 'bold' })
        .setOrigin(0.5)
        .setPadding(14, 6, 14, 6)
        .setBackgroundColor('rgba(10,12,16,0.72)');
      const arrow = this.add.image(0, 0, ATLAS, 'i_up').setTint(0x6fdc8c).setScale(0.9);
      this.views.push({ id, image, label, arrow, tier });
    }
    refreshCanvasTexture(tex);

    // Idle pile: one bubble, tap to collect everything.
    const bubbleBg = this.add.nineslice(0, 0, ATLAS, 'pill', 300, 84, 32, 32, 0, 0).setTint(0x1d6b3a);
    const bubbleIcon = this.add.image(-112, 0, ATLAS, 'i_cart').setScale(0.9);
    this.idleText = this.add
      .text(-80, 0, '', { fontFamily: FONT_FAMILY, fontSize: '26px', color: Colors.text, fontStyle: 'bold' })
      .setOrigin(0, 0.5);
    this.idleBubble = this.add.container(0, 0, [bubbleBg, bubbleIcon, this.idleText]).setSize(300, 84);
    bubbleBg.setInteractive({ useHandCursor: true });
    bubbleBg.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.collect());

    // Resources along the top.
    for (const r of RESOURCE_IDS) {
      this.resBg.push(this.add.nineslice(0, 0, ATLAS, 'pill', 200, 64, 32, 32, 0, 0).setTint(0x0b0f14).setAlpha(0.8));
      this.resIcons.push(this.add.image(0, 0, ATLAS, RESOURCE_ICON[r].icon).setTint(RESOURCE_ICON[r].tint).setScale(0.85));
      this.resTexts.push(this.add.bitmapText(0, 0, NUM_FONT, '0', 36).setOrigin(0, 0.5));
    }
    this.title = this.add
      .text(0, 0, t('shelter.title'), { fontFamily: FONT_FAMILY, fontSize: '40px', color: Colors.text, fontStyle: 'bold' })
      .setOrigin(0.5)
      .setShadow(0, 3, '#000000', 6, false, true);

    const next = Math.min(save.data.unlocked, LEVELS.length);
    this.startButton = new Button(this, 0, 0, t('shelter.start', { n: next }), () => this.scene.start(SceneKeys.Battle, { stage: next }), {
      width: 460,
      height: 112,
      fontSize: 40,
    });
    this.homeButton = new IconButton(this, 0, 0, 'i_home', () => this.scene.start(SceneKeys.Lobby), { size: 112 });

    this.createModal();
    this.coach = new Coach(this, D.coach);
    this.refresh();
    audio.playMusic('lobby');
    this.enter();
    this.bindLayout();
  }

  private createModal(): void {
    this.modalDim = this.add.image(0, 0, ATLAS, 'px').setOrigin(0).setTint(0x000000).setAlpha(0.6).setInteractive();
    this.modalDim.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.closeModal());
    const panel = this.add.nineslice(0, 0, ATLAS, 'panel', 640, 640, 20, 20, 20, 20).setTint(0x1a2028).setInteractive();
    this.modalTitle = this.add
      .text(0, -250, '', { fontFamily: FONT_FAMILY, fontSize: '44px', color: Colors.text, fontStyle: 'bold' })
      .setOrigin(0.5);
    this.modalDesc = this.add
      .text(0, -180, '', { fontFamily: FONT_FAMILY, fontSize: '26px', color: Colors.textDim, align: 'center', wordWrap: { width: 560 } })
      .setOrigin(0.5, 0);
    this.modalEffect = this.add
      .text(0, -60, '', { fontFamily: FONT_FAMILY, fontSize: '32px', color: Colors.accent, align: 'center', fontStyle: 'bold', lineSpacing: 10 })
      .setOrigin(0.5);
    const items: Phaser.GameObjects.GameObject[] = [panel, this.modalTitle, this.modalDesc, this.modalEffect];
    for (let i = 0; i < 3; i++) {
      const icon = this.add.image(0, 70, ATLAS, 'i_food');
      const text = this.add.bitmapText(0, 72, NUM_FONT, '0', 40).setOrigin(0, 0.5);
      this.modalCost.push({ icon, text });
      items.push(icon, text);
    }
    this.modalMax = this.add
      .text(0, 70, t('shelter.max'), { fontFamily: FONT_FAMILY, fontSize: '32px', color: Colors.text })
      .setOrigin(0.5);
    this.modalButton = new Button(this, 0, 190, '', () => this.doUpgrade(), { width: 460, height: 112 });
    const close = new IconButton(this, 270, -270, 'i_left', () => this.closeModal(), { size: 80, iconScale: 0.8 });
    items.push(this.modalMax, this.modalButton, close);
    this.modal = this.add.container(0, 0, items).setVisible(false);
    this.modalDim.setVisible(false);
  }

  override update(_time: number, delta: number): void {
    const dt = Math.min(delta, 100) / 1000;
    this.clock += dt;
    const fy = this.originY + CAMPFIRE.y;
    const fx = this.scale.width / 2 + CAMPFIRE.x - DESIGN_WIDTH / 2;
    const flicker = 0.85 + Math.sin(this.clock * 13) * 0.08 + Math.sin(this.clock * 7.3) * 0.07;
    this.fireGlow.setPosition(fx, fy - 10).setScale(2.4 * flicker, 1.8 * flicker).setAlpha(0.75 * flicker);
    for (let i = 0; i < SITTERS; i++) {
      const a = (i / SITTERS) * Math.PI * 2 + 0.3;
      const s = this.sitters[i];
      s.setPosition(fx + Math.cos(a) * 96, fy + Math.sin(a) * 52 + Math.sin(this.clock * 2 + i) * 1.5);
      s.depth = s.y;
    }
    const st = this.sparkState;
    for (let i = 0; i < SPARKS; i++) {
      const o = i * 4;
      st[o + 3] -= dt;
      if (st[o + 3] <= 0) {
        st[o] = fx + (Math.random() - 0.5) * 30;
        st[o + 1] = fy - 10;
        st[o + 2] = (Math.random() - 0.5) * 20;
        st[o + 3] = 0.8 + Math.random() * 1.2;
      }
      st[o] += st[o + 2] * dt;
      st[o + 1] -= 60 * dt;
      this.sparks[i].setPosition(st[o], st[o + 1]).setAlpha(Math.min(1, st[o + 3])).setScale(0.4);
    }
    for (const v of this.views) {
      if (v.arrow.visible) v.arrow.y = v.label.y - 56 + Math.sin(this.clock * 4) * 6;
    }
    this.updateCoach(dt);
    // Idle pile and affordability change with time; refresh once a second.
    this.refreshTimer += dt;
    if (this.refreshTimer >= 1) {
      this.refreshTimer = 0;
      this.refreshIdle();
    }
  }

  private updateCoach(dt: number): void {
    if (save.data.tutorial.shelter) {
      if (this.coach.visible) this.coach.hide();
      return;
    }
    const width = this.scale.width;
    let x = 0;
    let y = 0;
    let message = '';
    if (this.selected) {
      const cost = nextCost(save.data.buildings, this.selected);
      if (cost && canAfford(save.data.resources, cost)) {
        x = this.modal.x;
        y = this.modal.y + 220;
        message = t('tut.upgradeTap');
      }
    } else {
      const id = suggestedUpgrade(save.data);
      for (const v of this.views) {
        if (v.id !== id) continue;
        x = v.image.x;
        y = v.image.y - 70;
        message = t('tut.shelterTap');
      }
    }
    if (!message) {
      if (this.coach.visible) this.coach.hide();
      return;
    }
    this.coach.show(message);
    this.coach.tick(dt);
    this.coach.pointAt(x, y);
    const textY = this.selected ? this.modal.y + 370 : this.startButton.y - 120;
    this.coach.textAt(width / 2, textY, width - 40);
  }

  private refresh(): void {
    const res = save.data.resources;
    for (let i = 0; i < RESOURCE_IDS.length; i++) this.resTexts[i].setText(formatCount(Math.floor(res[RESOURCE_IDS[i]])));
    for (const v of this.views) {
      const level = levelOf(save.data.buildings, v.id);
      v.label.setText(`${buildingName(v.id)} ${t('common.level', { n: level })}`);
      const cost = nextCost(save.data.buildings, v.id);
      v.arrow.setVisible(!!cost && canAfford(res, cost));
    }
    this.refreshIdle();
    if (this.selected) this.fillModal(this.selected);
  }

  private refreshIdle(): void {
    const pending = idlePending(save.data.buildings, save.data.idle, Date.now());
    const parts: string[] = [];
    for (const r of RESOURCE_IDS) if (pending[r] > 0) parts.push(`${resourceName(r)} ${pending[r]}`);
    this.idleBubble.setVisible(parts.length > 0 && !this.selected);
    this.idleText.setText(parts.length ? `${parts.join(' · ')}` : '');
    const bg = this.idleBubble.list[0] as Phaser.GameObjects.NineSlice;
    const w = Math.max(220, this.idleText.width + 130);
    bg.setSize(w, 84);
    bg.input?.hitArea.setTo(0, 0, w, 84);
    (this.idleBubble.list[1] as Phaser.GameObjects.Image).x = -w / 2 + 44;
    this.idleText.x = -w / 2 + 80;
  }

  private collect(): void {
    const got = collectIdle(save.data, Date.now());
    save.commit();
    audio.play('coin');
    vibrate(20);
    let i = 0;
    for (const r of RESOURCE_IDS) {
      if (got[r] <= 0) continue;
      this.floatText(this.idleBubble.x, this.idleBubble.y - 40 - i * 44, `+${got[r]}`, r);
      i++;
    }
    this.refresh();
  }

  private floatText(x: number, y: number, text: string, r: ResourceId): void {
    const icon = this.add.image(x - 40, y, ATLAS, RESOURCE_ICON[r].icon).setTint(RESOURCE_ICON[r].tint).setScale(0.8).setDepth(D.float);
    const label = this.add.bitmapText(x - 10, y, NUM_FONT, text, 38).setOrigin(0, 0.5).setDepth(D.float);
    this.tweens.add({
      targets: [icon, label],
      y: y - 90,
      alpha: 0,
      duration: 900,
      ease: 'Cubic.Out',
      onComplete: () => {
        icon.destroy();
        label.destroy();
      },
    });
  }

  private openModal(id: BuildingId): void {
    if (this.selected) return;
    this.selected = id;
    this.fillModal(id);
    this.modal.setVisible(true).setScale(0.9).setAlpha(0);
    this.modalDim.setVisible(true);
    this.idleBubble.setVisible(false);
    this.tweens.add({ targets: this.modal, scale: 1, alpha: 1, duration: 160, ease: 'Back.Out' });
  }

  private closeModal(): void {
    this.selected = null;
    this.modal.setVisible(false);
    this.modalDim.setVisible(false);
    this.refreshIdle();
  }

  private fillModal(id: BuildingId): void {
    const level = levelOf(save.data.buildings, id);
    const top = level >= maxLevel(id);
    this.modalTitle.setText(`${buildingName(id)}  ${t('common.level', { n: level })}`);
    this.modalDesc.setText(buildingDesc(id));
    const now = effectText(id, effectAt(id, level));
    this.modalEffect.setText(top ? now : `${now}\n→ ${effectText(id, effectAt(id, level + 1))}`);
    const cost = nextCost(save.data.buildings, id);
    const res = save.data.resources;
    const needed = RESOURCE_IDS.filter((r) => (cost?.[r] ?? 0) > 0);
    const slotW = 190;
    for (let i = 0; i < this.modalCost.length; i++) {
      const slot = this.modalCost[i];
      const r = needed[i];
      const visible = !top && r !== undefined;
      slot.icon.setVisible(visible);
      slot.text.setVisible(visible);
      if (!visible) continue;
      const x = (i - (needed.length - 1) / 2) * slotW;
      const amount = cost?.[r] ?? 0;
      slot.icon.setFrame(RESOURCE_ICON[r].icon).setTint(RESOURCE_ICON[r].tint).setPosition(x - 50, 70);
      slot.text.setText(formatCount(amount)).setPosition(x - 18, 72).setTint(res[r] >= amount ? 0xffffff : 0xff6b6b);
    }
    this.modalMax.setVisible(top);
    const affordable = !!cost && canAfford(res, cost);
    this.modalButton.setVisible(!top);
    this.modalButton.setAlpha(affordable ? 1 : 0.45);
    this.modalButton.setLabel(affordable ? t('shelter.upgrade') : t('shelter.short'));
  }

  private doUpgrade(): void {
    const id = this.selected;
    if (!id) return;
    if (!upgrade(save.data, id)) {
      audio.play('gateBad');
      this.cameras.main.shake(120, 0.004);
      return;
    }
    save.data.tutorial.shelter = true;
    save.commit();
    audio.play('upgrade');
    vibrate(30);
    const view = this.views.find((v) => v.id === id)!;
    const tier = buildingTier(levelOf(save.data.buildings, id));
    if (tier !== view.tier) {
      view.tier = tier;
      const tex = ensureBuildingTexture(this);
      drawBuilding(tex, id, tier);
      refreshCanvasTexture(tex);
    }
    // Building pops, a ring flashes out from it.
    this.tweens.add({ targets: view.image, scaleX: { from: 1.12, to: 1 }, scaleY: { from: 0.9, to: 1 }, duration: 380, ease: 'Back.Out' });
    const ring = this.add
      .image(view.image.x, view.image.y - 60, ATLAS, 'ring')
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(0x8fe0a0)
      .setDepth(D.float);
    this.tweens.add({ targets: ring, scale: { from: 0.4, to: 2.6 }, alpha: { from: 0.9, to: 0 }, duration: 520, onComplete: () => ring.destroy() });
    this.refresh();
  }

  /** Whether anything in the shelter wants the player's attention (for the lobby badge). */
  static hasNews(): boolean {
    const data = save.data;
    for (const id of BUILDING_IDS) {
      const cost = nextCost(data.buildings, id);
      if (cost && canAfford(data.resources, cost)) return true;
    }
    const rates = idleRates(data.buildings);
    const pending = idlePending(data.buildings, data.idle, Date.now());
    return pending.food >= rates.food || pending.scrap >= rates.scrap;
  }

  protected layout(width: number, height: number): void {
    const cx = width / 2;
    // The 720×1280 frame is centered; taller screens see more of the background above and below.
    this.originY = (height - DESIGN_HEIGHT) / 2;
    const ox = cx - DESIGN_WIDTH / 2;
    const bgScale = Math.max(1, height / SHELTER_BG_H);
    this.bg.setPosition(cx, this.originY + DESIGN_HEIGHT / 2).setScale(bgScale);

    for (const v of this.views) {
      const spot = BUILDING_SPOTS[v.id];
      v.image.setPosition(ox + spot.x, this.originY + spot.y);
      v.image.depth = v.image.y;
      const labelY = this.originY + spot.y + (v.id === 'wall' ? 60 : 30);
      v.label.setPosition(ox + spot.x, labelY).setDepth(D.labels);
      v.arrow.setPosition(ox + spot.x + v.label.width / 2 + 20, labelY - 56).setDepth(D.labels);
    }
    this.fireGlow.setDepth(this.originY + CAMPFIRE.y - 1);
    for (const s of this.sparks) s.setDepth(D.labels - 1);
    // Idle pile sits on the road outside the gate, clear of the buildings and their labels.
    this.idleBubble.setPosition(cx, Math.max(this.insets.top + 210, this.originY + 200)).setDepth(D.bubble);

    const top = this.insets.top + 50;
    this.title.setPosition(cx, top).setDepth(D.hud);
    const pillY = top + 74;
    for (let i = 0; i < 3; i++) {
      const x = cx + (i - 1) * 224;
      this.resBg[i].setPosition(x, pillY).setDepth(D.hud);
      this.resIcons[i].setPosition(x - 66, pillY).setDepth(D.hud + 1);
      this.resTexts[i].setPosition(x - 36, pillY + 2).setDepth(D.hud + 1);
    }

    const bottom = height - this.insets.bottom - 90;
    this.homeButton.setPosition(80, bottom).setDepth(D.hud);
    this.startButton.setPosition(cx + 60, bottom).setDepth(D.hud);

    this.modalDim.setDisplaySize(width, height).setDepth(D.modalDim);
    this.modal.setPosition(cx, height / 2).setDepth(D.modal);
  }
}
