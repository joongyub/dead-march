import type { ResourceId } from '../meta/shelter';

/** Atlas icon and tint for each resource, shared by the HUD, result screen and shelter. */
export const RESOURCE_ICON: Record<ResourceId, { icon: string; tint: number }> = {
  food: { icon: 'i_food', tint: 0x9be07a },
  scrap: { icon: 'i_scrap', tint: 0xc9d3dc },
  fuel: { icon: 'i_fuel', tint: 0xffb44a },
};
