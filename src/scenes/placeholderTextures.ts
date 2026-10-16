import Phaser from 'phaser';
import { TextureKeys } from '../config';

/**
 * The two tiny textures the loading screen needs before the atlas exists (src/art/atlas.ts).
 * Both are white so one texture serves every tint.
 */
export function createBootTextures(scene: Phaser.Scene): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);

  g.fillStyle(0xffffff).fillRect(0, 0, 4, 4);
  g.generateTexture(TextureKeys.Pixel, 4, 4);
  g.clear();

  g.fillStyle(0xffffff).fillRoundedRect(0, 0, 64, 64, 20);
  g.generateTexture(TextureKeys.Panel, 64, 64);
  g.destroy();
}
