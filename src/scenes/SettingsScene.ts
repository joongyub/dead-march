import Phaser from 'phaser';
import { ATLAS } from '../art/atlas';
import { audio } from '../audio/Audio';
import { Colors, FONT_FAMILY, SceneKeys } from '../config';
import { lowSpecWanted, setLowSpec } from '../core/quality';
import { save } from '../game/save';
import { currentLang, resolveLang, t } from '../i18n';
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
  /** A Toggle, or a Button that steps through choices. */
  control: Phaser.GameObjects.Container;
  /** Horizontal offset of the control from the panel center. */
  controlX: number;
}

/** Switches and choices. Opens over the lobby or the pause menu. */
export class SettingsScene extends BaseScene {
  private dim!: Phaser.GameObjects.Image;
  private panel!: Phaser.GameObjects.NineSlice;
  private title!: Phaser.GameObjects.Text;
  private rows: Row[] = [];
  private closeButton!: Button;
  private licenseLink!: Phaser.GameObjects.Text;
  private note!: Phaser.GameObjects.Text;
  private from = '';
  /** Set when a change only applies after a restart (language). */
  private reloadOnClose = false;

  constructor() {
    super(SceneKeys.Settings);
  }

  create(data: SettingsData): void {
    this.from = data.from;
    this.rows = [];
    this.reloadOnClose = false;
    const settings = save.data.settings;
    this.dim = this.add.image(0, 0, ATLAS, 'px').setOrigin(0).setTint(0x000000).setAlpha(0.7).setInteractive();
    this.panel = this.add.nineslice(0, 0, ATLAS, 'panel', 600, 560, 20, 20, 20, 20).setTint(0x1a2028);
    this.title = this.add
      .text(0, 0, t('common.settings'), { fontFamily: FONT_FAMILY, fontSize: '52px', color: Colors.text, fontStyle: 'bold' })
      .setOrigin(0.5);

    const rowParts = (icon: string, label: string) => ({
      icon: this.add.image(0, 0, ATLAS, icon).setTint(0xcfd8e0),
      label: this.add.text(0, 0, label, { fontFamily: FONT_FAMILY, fontSize: '34px', color: Colors.text }).setOrigin(0, 0.5),
    });
    const addRow = (icon: string, label: string, initial: boolean, onChange: (v: boolean) => void) => {
      const control = new Toggle(this, 0, 0, initial, (v) => {
        onChange(v);
        save.commit();
      });
      this.rows.push({ ...rowParts(icon, label), control, controlX: 190 });
    };
    /** A button showing the current choice; each tap moves to the next one. */
    const addChoice = <T extends string>(icon: string, label: string, choices: readonly [T, string][], initial: T, onChange: (v: T) => void) => {
      let index = Math.max(0, choices.findIndex(([value]) => value === initial));
      const control: Button = new Button(
        this,
        0,
        0,
        choices[index][1],
        () => {
          index = (index + 1) % choices.length;
          control.setLabel(choices[index][1]);
          onChange(choices[index][0]);
          save.commit();
        },
        { width: 220, height: 84, fontSize: 30, color: Colors.neutral },
      );
      this.rows.push({ ...rowParts(icon, label), control, controlX: 160 });
    };
    addRow('i_sound', t('settings.sound'), settings.sound, (v) => {
      settings.sound = v;
      audio.setEnabled(v);
      if (v) audio.unlock();
    });
    addRow('i_vibe', t('settings.vibration'), settings.vibration, (v) => {
      settings.vibration = v;
      if (v) vibrate(40);
    });
    addRow('i_shake', t('settings.shake'), settings.shake, (v) => {
      settings.shake = v;
      if (v) this.cameras.main.shake(150, 0.008);
    });

    addChoice(
      'i_lang',
      t('settings.language'),
      [
        ['auto', t('settings.langAuto')],
        ['ko', '한국어'],
        ['en', 'English'],
      ],
      settings.lang,
      (v) => {
        settings.lang = v;
        // Words are baked into the battle atlas, so a new language needs a fresh start.
        this.reloadOnClose = resolveLang(v) !== currentLang();
        this.note.setText(this.reloadOnClose ? t('settings.langNote') : '');
      },
    );
    addChoice(
      'i_chip',
      t('settings.lowSpec'),
      [
        ['auto', t('settings.langAuto')],
        ['on', t('settings.on')],
        ['off', t('settings.off')],
      ],
      settings.lowSpec,
      (v) => {
        settings.lowSpec = v;
        setLowSpec(this.game, lowSpecWanted(v, save.data.device.lowSpec));
      },
    );
    this.note = this.add
      .text(0, 0, '', { fontFamily: FONT_FAMILY, fontSize: '24px', color: Colors.accent })
      .setOrigin(0.5);

    this.closeButton = new Button(this, 0, 0, t('common.close'), () => this.close(), { width: 360, color: Colors.neutral });
    this.licenseLink = this.add
      .text(0, 0, t('settings.licenses'), { fontFamily: FONT_FAMILY, fontSize: '24px', color: Colors.textDim })
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
    // The panel grows with the number of rows: title, rows, note, close button, license link.
    const panelH = 150 + this.rows.length * ROW_H + 40 + 240;
    const top = cy - panelH / 2;
    this.panel.setPosition(cx, cy).setSize(600, panelH);
    this.title.setPosition(cx, top + 80);
    this.rows.forEach((row, i) => {
      const y = top + 150 + ROW_H / 2 + i * ROW_H;
      row.icon.setPosition(cx - 230, y);
      row.label.setPosition(cx - 190, y);
      row.control.setPosition(cx + row.controlX, y);
    });
    this.note.setPosition(cx, top + 150 + this.rows.length * ROW_H + 16);
    this.closeButton.setPosition(cx, top + panelH - 165);
    this.licenseLink.setPosition(cx, top + panelH - 50);
  }

  private close(): void {
    if (this.reloadOnClose) {
      void save.flush().then(() => location.reload());
      return;
    }
    this.scene.stop();
    if (this.from) this.scene.resume(this.from);
  }
}
