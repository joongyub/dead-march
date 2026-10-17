/**
 * Draw order of the battle. The 3D world is one Extern object under everything (World3D.attach); the
 * Phaser layers above it are effects, labels pinned to world positions, then the HUD. Additive effects
 * and Text objects keep their own layers so blend-mode changes stay few.
 */
export const Depth = {
  World: -1000,
  Decals: 2,
  Fx: 20,
  FxAdd: 21,
  Labels: 22,
  Hud: 30,
  HudText: 31,
} as const;
