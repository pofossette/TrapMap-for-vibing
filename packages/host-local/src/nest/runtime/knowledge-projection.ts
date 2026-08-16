import type { KnowledgeEntry } from '@trapmap/contracts';
import type { KnowledgeReadPortDeps } from '@trapmap/service-knowledge-read';

import type { HostLocalRuntime } from './host-runtime.js';

/**
 * Bridge the knowledge-write owner port into the knowledge-read repo seam.
 *
 * The owner bundle returns the contracts `KnowledgeEntry` shape while the
 * knowledge-read deps expect the backend-core `KnowledgeEntryRecord` shape;
 * both describe the same runtime rows, so the projection casts across the
 * static-shape seam (lib type gap, documented below).
 */
type HostLocalKnowledgeRepo = KnowledgeReadPortDeps['knowledgeRepo'] & {
  getById(entryId: string): Promise<KnowledgeEntry | null>;
  listMine(input: { userId: string; teamId?: string }): Promise<KnowledgeEntry[]>;
  getStatus(): Promise<{ status: string; provider: string }>;
};

export function buildKnowledgeProjection(runtime: HostLocalRuntime): HostLocalKnowledgeRepo {
  return {
    getById: runtime.services.knowledgeOwner.getById,
    async listMine(input: { userId: string; teamId?: string }) {
      return runtime.services.knowledgeOwner.listByFilter({
        ownerUserId: input.userId,
        ...(input.teamId ? { teamId: input.teamId } : {}),
      });
    },
    async getStatus() {
      return { status: 'ready', provider: 'knowledge-write-owner' };
    },
    async listByFilter(filter) {
      return (await runtime.services.knowledgeOwner.listByFilter({
        ...(filter.ownerUserId !== undefined ? { ownerUserId: filter.ownerUserId } : {}),
        ...(filter.teamId !== undefined ? { teamId: filter.teamId } : {}),
      })) as unknown as Awaited<ReturnType<KnowledgeReadPortDeps['knowledgeRepo']['listByFilter']>>; // lib type gap: the projection repo seam bridges the owner port's contracts
      // entry shape (KnowledgeEntry) into the backend-core KnowledgeEntryRecord
      // shape; both describe the same runtime rows but the static shapes differ
    },
  };
}
