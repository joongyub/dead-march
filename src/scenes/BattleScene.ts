import Phaser from 'phaser';
import { Colors, FONT_FAMILY, SceneKeys, TextureKeys } from '../config';
import { FixedTimestep } from '../core/FixedTimestep';
import { flags } from '../platform/flags';
import { Button } from '../ui/Button';
import { BaseScene } from './BaseScene';

const SCROLL_SPEED = 420; // game units per second
const BENCH_TINTS = [0x5fb3ff, 0x6fd16f, 0xffd166, 0xc77dff];

/**
 * Battle skeleton: a scrolling road driven by fixed-step logic, plus a pause flow.
 * The runner combat itself arrives in stage 2. ?bench=N adds N moving sprites to measure rendering cost.
 */
export class BattleScene extends BaseScene {
  private readonly timestep = new FixedTimestep();
  private distance = 0;

  private ground!: Phaser.GameObjects.TileSprite;
  private hint!: Phaser.GameObjects.Text;
  private lobbyButton!: Button;
  private pauseButton!: Button;

  private benchSprites: Phaser.GameObjects.Image[] = [];
  private benchVel = new Float32Array(0);

  constructor() {
    super(SceneKeys.Battle);
  }

  create(): void {
    this.distance = 0;
    this.timestep.reset();

    this.ground = this.add.tileSprite(0, 0, 1, 1, TextureKeys.Ground).setOrigin(0);
    this.createBench(flags.bench);
    this.hint = this.add
      .text(0, 0, '전투 장면 뼈대\n러너 전투는 2단계에서 들어옵니다', {
        fontFamily: FONT_FAMILY,
        fontSize: '32px',
        color: Colors.textDim,
        align: 'center',
      })
      .setOrigin(0.5);
    this.lobbyButton = new Button(this, 0, 0, '로비', () => this.scene.start(SceneKeys.Lobby), {
      width: 160,
      height: 80,
      fontSize: 30,
      color: Colors.neutral,
    });
    this.pauseButton = new Button(this, 0, 0, 'II', () => this.openPause(), {
      width: 96,
      height: 80,
      fontSize: 32,
      color: Colors.neutral,
    });

    // Losing the screen mid-battle (home button, call, notification shade) always lands on the pause menu.
    this.game.events.on(Phaser.Core.Events.HIDDEN, this.openPause, this);
    this.game.events.on(Phaser.Core.Events.BLUR, this.openPause, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(Phaser.Core.Events.HIDDEN, this.openPause, this);
      this.game.events.off(Phaser.Core.Events.BLUR, this.openPause, this);
      this.benchSprites = [];
    });

    this.bindLayout();
  }

  override update(_time: number, delta: number): void {
    this.timestep.advance(delta, (dt) => this.step(dt));
    this.ground.tilePositionY = -(this.distance % 128);
  }

  openPause(): void {
    if (!this.scene.isActive() || this.scene.isPaused()) return;
    this.scene.pause();
    this.scene.launch(SceneKeys.Pause);
  }

  protected layout(width: number, height: number): void {
    const top = this.insets.top + 56;
    this.ground.setSize(width, height);
    this.hint.setPosition(width / 2, height * 0.45);
    this.lobbyButton.setPosition(24 + 80, top);
    this.pauseButton.setPosition(width - 24 - 48, top);
  }

  private step(dt: number): void {
    this.distance += SCROLL_SPEED * dt;
    if (this.benchSprites.length > 0) this.stepBench(dt);
  }

  private createBench(count: number): void {
    if (count <= 0) return;
    const { width, height } = this.scale;
    this.benchVel = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      const sprite = this.add
        .image(Math.random() * width, Math.random() * height, TextureKeys.Unit)
        .setTint(BENCH_TINTS[i % BENCH_TINTS.length]);
      this.benchSprites.push(sprite);
      const angle = Math.random() * Math.PI * 2;
      const speed = 80 + Math.random() * 160;
      this.benchVel[i * 2] = Math.cos(angle) * speed;
      this.benchVel[i * 2 + 1] = Math.sin(angle) * speed;
    }
  }

  private stepBench(dt: number): void {
    const { width, height } = this.scale;
    const vel = this.benchVel;
    const sprites = this.benchSprites;
    for (let i = 0; i < sprites.length; i++) {
      const s = sprites[i];
      let x = s.x + vel[i * 2] * dt;
      let y = s.y + vel[i * 2 + 1] * dt;
      if (x < 0 || x > width) {
        vel[i * 2] = -vel[i * 2];
        x = Phaser.Math.Clamp(x, 0, width);
      }
      if (y < 0 || y > height) {
        vel[i * 2 + 1] = -vel[i * 2 + 1];
        y = Phaser.Math.Clamp(y, 0, height);
      }
      s.setPosition(x, y);
    }
  }
}
