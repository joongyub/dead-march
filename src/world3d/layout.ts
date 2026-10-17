import { ROAD_CENTER, ROAD_LEFT, ROAD_RIGHT } from '../sim/types';

/**
 * Sizes shared by the 3D world and the Phaser scene. Kept apart from the Three.js code so the battle
 * scene can use them without pulling the 3D engine into the first download.
 */

/** Gate glass: bottom edge and height above the road. */
export const GATE_BOTTOM = 14;
export const GATE_HEIGHT = 112;
/** Middle of a gate side's glass, where its label sits. */
export const GATE_LABEL_Y = GATE_BOTTOM + GATE_HEIGHT / 2;

/** Road x of the middle of gate side 0 (left) or 1 (right). */
export function sideX(side: number): number {
  return side === 0 ? (ROAD_LEFT + ROAD_CENTER) / 2 : (ROAD_CENTER + ROAD_RIGHT) / 2;
}
