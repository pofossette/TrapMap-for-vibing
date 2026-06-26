import type { KnowledgeReadPort } from '@trapmap/backend-core';

/**
 * In-process adapter for KnowledgeReadPort.
 *
 * This is the default adapter for local-agent and team-monolith profiles.
 * It delegates directly to a concrete KnowledgeReadPort implementation
 * created by the backend-core module factory.
 *
 * Per Phase 1 rules: in-process is NOT a test stub — it is the primary
 * implementation surface for the modular monolith.
 */
export class InProcessKnowledgeReadAdapter implements KnowledgeReadPort {
  constructor(private readonly port: KnowledgeReadPort) {}

  getById(entryId: string) {
    return this.port.getById(entryId);
  }

  listMine(userId: string, teamId?: string) {
    return this.port.listMine(userId, teamId);
  }

  search(params: { query: string; teamId?: string; limit?: number }) {
    return this.port.search(params);
  }

  getProjectionStatus() {
    return this.port.getProjectionStatus();
  }
}
