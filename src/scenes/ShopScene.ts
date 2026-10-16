import Phaser from 'phaser';
import { ATLAS } from '../art/atlas';
import { audio } from '../audio/Audio';
import { Colors, FONT_FAMILY, SceneKeys } from '../config';
import { grantProduct, owns, PRODUCTS, productDef, restoreProducts } from '../game/shop';
import { t } from '../i18n';
import { services, type ProductId } from '../services';
import { Button } from '../ui/Button';
import { BaseScene } from './BaseScene';

export interface ShopData {
  /** Scene paused underneath, resumed when the shop closes. */
  from: string;
}

interface Row {
  id: ProductId;
  icon: Phaser.GameObjects.Image;
  name: Phaser.GameObjects.Text;
  desc: Phaser.GameObjects.Text;
  buy: Button;
}

const ROW_H = 150;

/** Remove ads and a supply crate. Prices come from the store (Google Play in the app). */
export class ShopScene extends BaseScene {
  private dim!: Phaser.GameObjects.Image;
  private panel!: Phaser.GameObjects.NineSlice;
  private title!: Phaser.GameObjects.Text;
  private rows: Row[] = [];
  private message!: Phaser.GameObjects.Text;
  private restoreButton!: Button;
  private closeButton!: Button;
  private from = '';
  private prices = new Map<ProductId, string>();
  /** A purchase or restore is waiting for the store; other taps are ignored meanwhile. */
  private busy = false;

  constructor() {
    super(SceneKeys.Shop);
  }

  create(data: ShopData): void {
    this.from = data.from;
    this.rows = [];
    this.busy = false;
    this.prices = new Map(PRODUCTS.map((p) => [p.id, '…']));
    this.dim = this.add.image(0, 0, ATLAS, 'px').setOrigin(0).setTint(0x000000).setAlpha(0.7).setInteractive();
    this.panel = this.add.nineslice(0, 0, ATLAS, 'panel', 620, 700, 20, 20, 20, 20).setTint(0x1a2028);
    this.title = this.add
      .text(0, 0, t('shop.title'), { fontFamily: FONT_FAMILY, fontSize: '52px', color: Colors.text, fontStyle: 'bold' })
      .setOrigin(0.5);

    for (const p of PRODUCTS) {
      const row: Row = {
        id: p.id,
        icon: this.add.image(0, 0, ATLAS, p.id === 'remove_ads' ? 'i_ad' : 'i_cart').setTint(p.id === 'remove_ads' ? 0xff8a65 : 0xffd25a),
        name: this.add
          .text(0, 0, t(`shop.${p.id}.name`), { fontFamily: FONT_FAMILY, fontSize: '34px', color: Colors.text, fontStyle: 'bold' })
          .setOrigin(0, 0.5),
        desc: this.add
          .text(0, 0, t(`shop.${p.id}.desc`), { fontFamily: FONT_FAMILY, fontSize: '22px', color: Colors.textDim, wordWrap: { width: 290 } })
          .setOrigin(0, 0),
        buy: new Button(this, 0, 0, '…', () => void this.buy(p.id), { width: 190, height: 84, fontSize: 30 }),
      };
      this.rows.push(row);
    }
    this.message = this.add
      .text(0, 0, '', { fontFamily: FONT_FAMILY, fontSize: '26px', color: Colors.accent, align: 'center', wordWrap: { width: 540 } })
      .setOrigin(0.5);
    this.restoreButton = new Button(this, 0, 0, t('shop.restore'), () => void this.restore(), {
      width: 360,
      height: 84,
      fontSize: 30,
      color: Colors.neutral,
    });
    this.closeButton = new Button(this, 0, 0, t('common.close'), () => this.close(), { width: 360, color: Colors.neutral });
    this.refreshButtons();
    services.analytics.log('shop_open');

    void services.purchases
      .products()
      .then((list) => {
        for (const p of list) if (p.price) this.prices.set(p.id, p.price);
        if (list.length === 0) this.message.setText(t('shop.unavailable'));
      })
      .catch(() => this.message.setText(t('shop.unavailable')))
      .finally(() => {
        if (this.scene.isActive()) this.refreshButtons();
      });
    this.bindLayout();
  }

  override onBack(): boolean {
    if (!this.busy) this.close();
    return true;
  }

  protected layout(width: number, height: number): void {
    const cx = width / 2;
    const cy = height / 2;
    this.dim.setDisplaySize(width, height);
    const panelH = 150 + this.rows.length * ROW_H + 80 + 240;
    const top = cy - panelH / 2;
    this.panel.setPosition(cx, cy).setSize(620, panelH);
    this.title.setPosition(cx, top + 80);
    this.rows.forEach((row, i) => {
      const y = top + 150 + ROW_H / 2 + i * ROW_H;
      row.icon.setPosition(cx - 250, y - 20);
      row.name.setPosition(cx - 210, y - 22);
      row.desc.setPosition(cx - 210, y + 4);
      row.buy.setPosition(cx + 185, y - 10);
    });
    const bottom = top + 150 + this.rows.length * ROW_H;
    this.message.setPosition(cx, bottom + 30);
    this.restoreButton.setPosition(cx, bottom + 110);
    this.closeButton.setPosition(cx, bottom + 230);
  }

  private refreshButtons(): void {
    for (const row of this.rows) {
      const bought = productDef(row.id).type === 'nonConsumable' && owns(row.id);
      row.buy.setLabel(bought ? t('shop.owned') : (this.prices.get(row.id) ?? '…'));
      row.buy.setAlpha(bought ? 0.55 : 1);
    }
  }

  private async buy(id: ProductId): Promise<void> {
    if (this.busy || (productDef(id).type === 'nonConsumable' && owns(id))) return;
    this.busy = true;
    this.message.setText(t('shop.waiting'));
    const ok = await services.purchases.buy(id).catch(() => false);
    this.busy = false;
    if (!this.scene.isActive()) return;
    if (ok && grantProduct(id)) {
      audio.play('coin');
      services.analytics.log('purchase', { product: id });
      this.message.setText(t('shop.thanks', { name: t(`shop.${id}.name`) }));
    } else {
      this.message.setText(ok ? '' : t('shop.cancelled'));
    }
    this.refreshButtons();
  }

  private async restore(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.message.setText(t('shop.waiting'));
    const ids = await services.purchases.restore().catch(() => null);
    this.busy = false;
    if (!this.scene.isActive()) return;
    if (ids === null) {
      this.message.setText(t('shop.unavailable'));
      return;
    }
    const restored = restoreProducts(ids);
    services.analytics.log('restore', { count: restored.length });
    this.message.setText(restored.length > 0 ? t('shop.restored') : t('shop.nothingToRestore'));
    this.refreshButtons();
  }

  private close(): void {
    this.scene.stop();
    if (this.from) this.scene.resume(this.from);
  }
}
