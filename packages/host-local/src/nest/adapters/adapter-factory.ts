import type { KnowledgeReadPort } from '@trapmap/backend-core';

import { InProcessKnowledgeReadAdapter } from './in-process.adapter.js';
import { RemoteKnowledgeReadAdapter } from './remote.adapter.js';

export type AdapterMode = 'in-process' | 'remote';

export interface KnowledgeReadAdapterOptions {
  mode: AdapterMode;
  /**
   * Required when mode = 'in-process'.
   * The concrete KnowledgeReadPort from the backend-core module factory.
   */
  port?: KnowledgeReadPort;
  /**
   * Required when mode = 'remote'.
   * Base URL of the knowledge-read service (e.g. http://localhost:4001).
   */
  remoteBaseUrl?: string;
  /**
   * Optional header provider for remote adapter (requestId/traceId propagation).
   */
  getHeaders?: () => Record<string, string>;
  /**
   * Timeout in ms for remote calls. Defaults to 10_000.
   */
  timeoutMs?: number;
}

/**
 * Factory that creates the appropriate KnowledgeReadPort adapter
 * based on the deployment profile and configuration.
 *
 * Adapter selection is the host assembly's responsibility —
 * business code never chooses between in-process and remote.
 */
export function createKnowledgeReadAdapter(
  options: KnowledgeReadAdapterOptions,
): KnowledgeReadPort {
  if (options.mode === 'in-process') {
    if (!options.port) {
      throw new Error('In-process adapter requires a concrete KnowledgeReadPort implementation');
    }
    return new InProcessKnowledgeReadAdapter(options.port);
  }

  if (!options.remoteBaseUrl) {
    throw new Error('Remote adapter requires a remoteBaseUrl for the knowledge-read service');
  }
  return new RemoteKnowledgeReadAdapter(
    options.remoteBaseUrl,
    options.getHeaders,
    options.timeoutMs,
  );
}
