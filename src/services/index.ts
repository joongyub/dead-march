import type { Services } from './types';
import { webServices } from './web';

export type { AdsService, AnalyticsParams, AnalyticsService, Product, ProductId, PurchasesService, Services } from './types';

/** The services in use: the pretend web ones until the Android app installs the real ones. */
export const services: Services = { ...webServices };

export function setServices(next: Partial<Services>): void {
  Object.assign(services, next);
}
