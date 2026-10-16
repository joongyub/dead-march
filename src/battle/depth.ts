/**
 * Draw order of the battle. Everything up to Hud comes from the one atlas, so the order only matters
 * where blend modes change (additive effects) or where a Text object sits; keep those on their own layers.
 */
export const Depth = {
  Ground: 0,
  RoadMarks: 1,
  Decals: 2,
  Gates: 3,
  Props: 4,
  Barricades: 5,
  /** Units, zombies and the boss are sorted by screen y within [Actors, Actors + 1). */
  Actors: 10,
  Fx: 20,
  FxAdd: 21,
  Labels: 22,
  Hud: 30,
  HudText: 31,
} as const;

/** Depth for an actor at screen y, so lower things draw in front. */
export function actorDepth(y: number): number {
  return Depth.Actors + Math.max(0, Math.min(0.999, (y + 500) / 4000));
}
