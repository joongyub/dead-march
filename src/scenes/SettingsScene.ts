import Phaser from 'phaser';
import { ATLAS } from '../art/atlas';
import { audio } from '../audio/Audio';
import { Colors, FONT_FAMILY, SceneKeys } from '../config';
import { save } from '../game/save';
import { vibrate } from '../platform/haptics';
import { Button } from '../ui/Button';
import { Toggle } from '../ui/Toggle';
import { BaseScene } from './BaseScene';

export interface SettingsData {
  /** Scene paused underneath, resumed when settings close. */
  from: string;
}

const ROW_H = 110;

interface Row {
  icon: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  toggle: Toggle;
}

/** Sound, vibration and screen-shake switches. Opens over the lobby or the pause menu. */
export class SettingsScene extends BaseScene {
  private dim!: Phaser.GameObjects.Image;
  private panel!: Phaser.GameObjects.NineSlice;
  private title!: Phaser.GameObjects.Text;
  private rows: Row[] = [];
  private closeButton!: Button;
  private licenseLink!: Phaser.GameObjects.Text;
  private from = '';

  constructor() {
    super(SceneKeys.Settings);
  }

  create(data: SettingsData): void {
    this.from = data.from;
    this.rows = [];
    const settings = save.data.settings;
    this.dim = this.add.image(0, 0, ATLAS, 'px').setOrigin(0).setTint(0x000000).setAlpha(0.7).setInteractive();
    this.panel = this.add.nineslice(0, 0, ATLAS, 'panel', 600, 560, 20, 20, 20, 20).setTint(0x1a2028);
    this.title = this.add
      .text(0, 0, '설정', { fontFamily: FONT_FAMILY, fontSize: '52px', color: Colors.text, fontStyle: 'bold' })
      .setOrigin(0.5);

    const addRow = (icon: string, label: string, initial: boolean, onChange: (v: boolean) => void) => {
      this.rows.push({
        icon: this.add.image(0, 0, ATLAS, icon).setTint(0xcfd8e0),
        label: this.add.text(0, 0, label, { fontFamily: FONT_FAMILY, fontSize: '34px', color: Colors.text }).setOrigin(0, 0.5),
        toggle: new Toggle(this, 0, 0, initial, (v) => {
          onChange(v);
          save.commit();
        }),
      });
    };
    addRow('i_sound', '소리', settings.sound, (v) => {
      settings.sound = v;
      audio.setEnabled(v);
      if (v) audio.unlock();
    });
    addRow('i_vibe', '진동', settings.vibration, (v) => {
      settings.vibration = v;
      if (v) vibrate(40);
    });
    addRow('i_shake', '화면 흔들림', settings.shake, (v) => {
      settings.shake = v;
      if (v) this.cameras.main.shake(150, 0.008);
    });

    this.closeButton = new Button(this, 0, 0, '닫기', () => this.close(), { width: 360, color: Colors.neutral });
    this.licenseLink = this.add
      .text(0, 0, '오픈소스 라이선스', { fontFamily: FONT_FAMILY, fontSize: '24px', color: Colors.textDim })
      .setOrigin(0.5)
      .setPadding(40, 28, 40, 28) // keeps the touch area at least 80 units tall
      .setInteractive({ useHandCursor: true })
      .on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => window.open('./licenses.txt', '_blank'));
    this.bindLayout();
  }

  protected layout(width: number, height: number): void {
    const cx = width / 2;
    const cy = height / 2;
    this.dim.setDisplaySize(width, height);
    // The panel grows with the number of rows: title, rows, close button, license link.
    const panelH = 150 + this.rows.length * ROW_H + 240;
    const top = cy - panelH / 2;
    this.panel.setPosition(cx, cy).setSize(600, panelH);
    this.title.setPosition(cx, top + 80);
    this.rows.forEach((row, i) => {
      const y = top + 150 + ROW_H / 2 + i * ROW_H;
      row.icon.setPosition(cx - 230, y);
      row.label.setPosition(cx - 190, y);
      row.toggle.setPosition(cx + 190, y);
    });
    this.closeButton.setPosition(cx, top + panelH - 165);
    this.licenseLink.setPosition(cx, top + panelH - 50);
  }

  private close(): void {
    this.scene.stop();
    if (this.from) this.scene.resume(this.from);
  }
}
