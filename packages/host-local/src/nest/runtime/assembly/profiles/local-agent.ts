/**
 * local-agent profile builder (Phase 2 assembly pilot).
 *
 * Thin wrapper over the shared embedded pilot composition. The async
 * `createHostLocalRuntime()` runs in the Nest bootstrap (outside cordis) so
 * every node apply stays synchronous and boot is deterministic.
 */
import { composePilotProfile, type PilotProfileOptions } from './compose.js';

export type LocalAgentProfileOptions = PilotProfileOptions;

/**
 * Build the local-agent assembly builder.
 *
 * Call `build()` (startup checks) then `boot()` to run the host.
 */
export function localAgentAssembly(options: LocalAgentProfileOptions) {
  return composePilotProfile(options);
}
