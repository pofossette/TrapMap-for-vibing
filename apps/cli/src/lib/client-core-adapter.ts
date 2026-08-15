import type { SessionProvider } from '@trapmap/client-core';

import type { CliState } from './config.js';
import { resolveCliGatewayUrl } from './config.js';

/**
 * Adapts CLI {@link CliState} to the generic {@link SessionProvider} contract
 * from `@trapmap/client-core`.
 *
 * This is the bridge between CLI-specific state management and the
 * platform-agnostic gateway transport layer.
 */
export class CliSessionProvider implements SessionProvider {
  constructor(private readonly state: CliState) {}

  getBaseUrl(): string {
    return resolveCliGatewayUrl(this.state);
  }

  getSessionToken(): string | null {
    return this.state.sessionToken;
  }
}
