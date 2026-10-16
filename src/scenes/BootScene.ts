import Phaser from 'phaser';
import { SceneKeys } from '../config';
import { createBootTextures } from './placeholderTextures';

/** Creates the few textures the loading screen itself needs, then hands off. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Boot);
  }

  create(): void {
    createBootTextures(this);
    this.scene.start(SceneKeys.Preload);
  }
}
