import Phaser from 'phaser';
import { ATLAS, formatCount, NUM_FONT } from '../art/atlas';
import { audio } from '../audio/Audio';
import { Colors, DESIGN_HEIGHT, DESIGN_WIDTH, FONT_FAMILY, SceneKeys } from '../config';
import { setFrameCap } from '../core/frameRate';
import { viewWidth } from '../core/quality';
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
import { services } from '../services';
import { Button } from '../ui/Button';
import { Coach } from '../ui/Coach';
import { IconButton } from '../ui/IconButton';
import { RESOURCE_ICON } from '../ui/resourceIcons';
import { BaseScene } from './BaseScene';
import type { BuildingRect, ShelterWorld } from '../world3d/ShelterWorld';
import { shelterWorld } from '../world3d/registry';

/** Draw order above the 3D yard. */
const D = { labels: 5000, bubble: 5100, hud: 5200, float: 5500, modalDim: 6000, modal: 6001, coach: 6100 } as const;

/** Buildings have three looks: levels 1–6, 7–13 and 14 up. */
function buildingTier(level: number): number {
  return level >= 14 ? 2 : level >= 7 ? 1 : 0;
}

/** Without WebGL2 the buildings are plain labeled buttons at these spots of the 720×1280 frame. */
const FLAT_SPOTS: Record<BuildingId, { x: number; y: number }> = {
  wall: { x: 360, y: 330 },
  armory: { x: 180, y: 590 },
  garage: { x: 540, y: 590 },
  farm: { x: 180, y: 990 },
  radio: { x: 540, y: 990 },
};

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
  /** Invisible tap area over the 3D building. */
  hit: Phaser.GameObjects.Zone;
  label: Phaser.GameObjects.Text;
  arrow: Phaser.GameObjects.Image;
  tier: number;
}

interface CostSlot {
  icon: Phaser.GameObjects.Image;
  text: Phaser.GameObjects.BitmapText;
}

/**
 * The shelter: spend battle resources on five buildings, collect what piled up while away. The yard
 * is 3D (world3d/ShelterWorld.ts); this scene puts the labels, tap areas, resources and the upgrade
 * window over it. Mostly still, so it runs at 30fps.
 */
export class ShelterScene extends BaseScene {
  private sw: ShelterWorld | null = null;
  private readonly rect: BuildingRect = { x: 0, y: 0, w: 0, h: 0, labelX: 0, labelY: 0 };
  private views: BuildingView[] = [];
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

  private clock = 0;
  private refreshTimer = 0;

  constructor() {
    super(SceneKeys.Shelter);
  }

  create(): void {
    setFrameCap(this.game, 30);
    this.views = [];
    this.resBg = [];
    this.resIcons = [];
    this.resTexts = [];
    this.modalCost = [];
    this.selected = null;
    this.clock = 0;

    if (guardClock(save.data.idle, Date.now())) save.commit();

    this.sw = shelterWorld();
    const tiers = {} as Record<BuildingId, number>;
    for (const id of BUILDING_IDS) tiers[id] = buildingTier(levelOf(save.data.buildings, id));
    if (this.sw) {
      this.sw.world.attach(this);
      this.sw.begin(tiers);
      this.cameras.main.setBackgroundColor(this.sw.fogColor);
    }

    for (const id of BUILDING_IDS) {
      const hit = this.add.zone(0, 0, 160, 160).setInteractive({ useHandCursor: true });
      hit.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.openModal(id));
      const label = this.add
        .text(0, 0, '', { fontFamily: FONT_FAMILY, fontSize: '26px', color: Colors.text, fontStyle: 'bold' })
        .setOrigin(0.5)
        .setPadding(14, 6, 14, 6)
        .setBackgroundColor('rgba(10,12,16,0.72)');
      const arrow = this.add.image(0, 0, ATLAS, 'i_up').setTint(0x6fdc8c).setScale(0.9);
      this.views.push({ id, hit, label, arrow, tier: tiers[id] });
    }

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
    this.sw?.update(dt);
    for (const v of this.views) {
      if (v.arrow.visible) v.arrow.setPosition(v.label.x + v.label.width / 2 + 24, v.label.y - 4 + Math.sin(this.clock * 4) * 6);
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
    const width = viewWidth(this.scale);
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
        x = v.hit.x;
        y = v.hit.y;
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

  override onBack(): boolean {
    if (this.selected) this.closeModal();
    else this.scene.start(SceneKeys.Lobby);
    return true;
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
    services.analytics.log('upgrade', { building: id, level: levelOf(save.data.buildings, id) });
    audio.play('upgrade');
    vibrate(30);
    const view = this.views.find((v) => v.id === id)!;
    view.tier = buildingTier(levelOf(save.data.buildings, id));
    // The building jumps (or rises in its new look), dust and a ring fly out.
    this.sw?.upgrade(id, view.tier);
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
    // Tap areas and labels follow the buildings on screen (the camera keeps the yard's width on any phone).
    const sw = this.sw;
    sw?.world.sync(360, 0);
    const r = this.rect;
    const originY = (height - DESIGN_HEIGHT) / 2;
    for (const v of this.views) {
      if (sw) {
        sw.rect(v.id, r);
      } else {
        const spot = FLAT_SPOTS[v.id];
        r.x = cx - DESIGN_WIDTH / 2 + spot.x;
        r.y = originY + spot.y - 80;
        r.w = v.id === 'wall' ? 640 : 220;
        r.h = 160;
        r.labelX = r.x;
        r.labelY = r.y + 100;
      }
      v.hit.setPosition(r.x, r.y).setSize(r.w, r.h);
      v.label.setPosition(r.labelX, r.labelY).setDepth(D.labels);
      v.arrow.setDepth(D.labels);
    }
    // Idle pile sits on the road outside the gate, clear of the buildings and their labels.
    let bubbleY = originY + 200;
    if (sw) {
      sw.rect('wall', r);
      bubbleY = r.y - r.h / 2 - 50;
    }
    this.idleBubble.setPosition(cx, Math.max(this.insets.top + 210, bubbleY)).setDepth(D.bubble);

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
