import type { SkillShareerServices } from '@trapmap/server/lib/context.js';

import type { HostLocalServices } from './host-services.js';

// Compat-only bridge for server helpers that still require the historical
// context shape. Do not extend this into a new default assembly seam.
export function asServerSkillShareerServices(services: HostLocalServices): SkillShareerServices {
  return services as unknown as SkillShareerServices;
}
