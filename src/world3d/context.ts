let context: WebGL2RenderingContext | null = null;

/**
 * Creates the WebGL2 context Phaser runs on, before the game starts, so the 3D world (loaded later)
 * can draw into the same canvas. Phaser 3 on its own would make a WebGL1 context, which Three.js no
 * longer supports. Returns null where WebGL2 is missing; Phaser then makes its own context.
 */
export function createSharedContext(canvas: HTMLCanvasElement): WebGL2RenderingContext | null {
  context = canvas.getContext('webgl2', {
    alpha: false,
    depth: true,
    stencil: true,
    antialias: true,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
    powerPreference: 'default',
  });
  return context;
}

export function sharedContext(): WebGL2RenderingContext | null {
  return context;
}
