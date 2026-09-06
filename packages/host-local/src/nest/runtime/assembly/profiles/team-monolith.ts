/**
 * team-monolith profile builder (Phase 2 assembly pilot).
 *
 * Same embedded composition as local-agent (pg required); the difference is
 * the profile name. Reuses the shared pilot composition helper.
 */
import { composePilotProfile, type PilotProfileOptions } from './compose.js';

export type TeamMonolithProfileOptions = PilotProfileOptions;

export function teamMonolithAssembly(options: TeamMonolithProfileOptions) {
  return composePilotProfile(options);
}
