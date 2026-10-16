import Phaser from 'phaser';
import { ATLAS } from '../art/atlas';
import { FONT_FAMILY } from '../config';

/**
 * A pointing finger and one line of text, the only tutorial device the game uses. The finger bobs
 * with its tip on the spot it points at; the text is a dark pill placed separately.
 */
export class Coach {
  private readonly hand: Phaser.GameObjects.Image;
  private readonly text: Phaser.GameObjects.Text;
  private clock = 0;

  constructor(scene: Phaser.Scene, depth: number) {
    this.hand = scene.add.image(0, 0, ATLAS, 'i_hand').setDepth(depth + 1).setScale(1.4).setVisible(false);
    this.text = scene.add
      .text(0, 0, '', {
        fontFamily: FONT_FAMILY,
        fontSize: '32px',
        color: '#ffffff',
        fontStyle: 'bold',
        backgroundColor: 'rgba(8,10,14,0.8)',
        padding: { x: 22, y: 12 },
      })
      .setOrigin(0.5)
      .setDepth(depth)
      .setVisible(false);
  }

  get visible(): boolean {
    return this.hand.visible;
  }

  show(message: string): this {
    if (this.text.text !== message) this.text.setText(message);
    this.text.setVisible(message !== '');
    this.hand.setVisible(true);
    return this;
  }

  hide(): void {
    this.hand.setVisible(false);
    this.text.setVisible(false);
  }

  /** Advances the bob; call once per frame while visible. */
  tick(dt: number): void {
    this.clock += dt;
  }

  /** Finger below (x, y), tip touching it, bobbing up and down. */
  pointAt(x: number, y: number): void {
    // The fingertip is near the top of the 64×64 icon, 28 units above its center (×1.4 scale).
    this.hand.setPosition(x + 3, y + 40 + Math.abs(Math.sin(this.clock * 5)) * 16);
  }

  /** Finger sweeping left and right around (x, y), for "drag" lessons. */
  sweepAt(x: number, y: number, reach: number): void {
    this.hand.setPosition(x + Math.sin(this.clock * 3) * reach, y);
  }

  /** Places the text; it shrinks to fit maxWidth so it always stays on one line. */
  textAt(x: number, y: number, maxWidth = Infinity): void {
    this.text.setPosition(x, y).setScale(Math.min(1, maxWidth / this.text.width));
  }
}
