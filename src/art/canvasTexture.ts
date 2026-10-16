import Phaser from 'phaser';

/**
 * Registers a drawn canvas as a texture. Phaser's own addCanvas/createCanvas wrap it in a CanvasTexture
 * whose constructor reads every pixel back with getImageData: a GPU readback that costs tens of
 * milliseconds per large canvas on a phone (seconds in the headless test browser). Nothing here needs
 * pixel access, so the canvas goes straight to the GPU instead.
 */
export function addCanvasTexture(scene: Phaser.Scene, key: string, canvas: HTMLCanvasElement): Phaser.Textures.Texture {
  const texture = scene.textures.create(key, canvas, canvas.width, canvas.height)!;
  texture.add('__BASE', 0, 0, 0, canvas.width, canvas.height);
  return texture;
}

/** The canvas behind a texture made by addCanvasTexture, for redrawing it. */
export function textureCanvas(texture: Phaser.Textures.Texture): HTMLCanvasElement {
  return texture.getSourceImage() as HTMLCanvasElement;
}

/** Uploads the canvas again after it was redrawn. */
export function refreshCanvasTexture(texture: Phaser.Textures.Texture): void {
  texture.source[0].update();
}
