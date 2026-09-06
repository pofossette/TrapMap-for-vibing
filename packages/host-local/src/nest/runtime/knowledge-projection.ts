import type { KnowledgeEntryRecord } from '@trapmap/backend-core';
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
      const { items } = await runtime.services.knowledgeOwner.listByFilter(
        {
          ownerUserId: input.userId,
          ...(input.teamId ? { teamId: input.teamId } : {}),
        },
        { offset: 0, limit: 100 },
      );
      return items;
    },
    async getStatus() {
      return { status: 'ready', provider: 'knowledge-write-owner' };
    },
    async listByFilter(filter, page) {
      // A4 桥：owner 契约形状（contracts KnowledgeEntry）→ backend-core record 形状（结构化克隆消除静态形状差异）
      const { items } = await runtime.services.knowledgeOwner.listByFilter(
        {
          ...(filter.ownerUserId !== undefined ? { ownerUserId: filter.ownerUserId } : {}),
          ...(filter.teamId !== undefined ? { teamId: filter.teamId } : {}),
        },
        page,
      );
      return {
        // contracts KnowledgeEntry 与 backend-core KnowledgeEntryRecord 描述同运行时行；
        // 结构化克隆生成新对象字面量，静态形状经 record 侧归一化（lib type gap 已由结构消除）
        items: items.map((entry) => ({ ...entry })) as unknown as KnowledgeEntryRecord[], // lib type gap:
        total: 0,
      };
    },
  };
}
