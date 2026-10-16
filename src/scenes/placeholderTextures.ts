import Phaser from 'phaser';
import { Colors, TextureKeys } from '../config';

/**
 * Stand-in art drawn once at startup. Stage 5 replaces these with one texture atlas;
 * until then everything stays white-tintable so a single texture can serve many colors.
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

export function createGameTextures(scene: Phaser.Scene): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);

  g.fillStyle(0xffffff).fillCircle(16, 16, 15);
  g.lineStyle(3, 0x000000, 0.35).strokeCircle(16, 16, 14);
  g.generateTexture(TextureKeys.Unit, 32, 32);
  g.clear();

  g.fillStyle(Colors.ground).fillRect(0, 0, 128, 128);
  g.fillStyle(Colors.groundLine).fillRect(60, 0, 8, 56);
  g.fillStyle(Colors.groundLine, 0.5).fillRect(0, 0, 128, 2);
  g.generateTexture(TextureKeys.Ground, 128, 128);
  g.destroy();
}
