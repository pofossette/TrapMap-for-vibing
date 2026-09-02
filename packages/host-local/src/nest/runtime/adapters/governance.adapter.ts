import type { AuditLogPort } from '@trapmap/backend-core';
import { nowIso } from '@trapmap/lib';

import type { HostLocalRepos } from '../shared-infra.js';

export function createAuditLogPort(repos: Pick<HostLocalRepos, 'audit'>): AuditLogPort {
  return {
    async record(entry) {
      const id = await repos.audit.nextId();
      const timestamp = entry.timestamp ?? nowIso();
      await repos.audit.insert({
        id,
        teamId: entry.teamId ?? null,
        actorId: entry.actorId,
        action: entry.action,
        entityId: entry.entityId ?? '',
        payload: entry.metadata ?? {},
        eventVersion: entry.eventVersion ?? 1,
        sourceService: entry.sourceService ?? 'host-local',
        ...(entry.requestId ? { requestId: entry.requestId } : {}),
        ...(entry.traceId ? { traceId: entry.traceId } : {}),
        ...(entry.operationId ? { operationId: entry.operationId } : {}),
        ...(entry.causationId ? { causationId: entry.causationId } : {}),
        outcome: entry.outcome ?? 'success',
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    },
    async query(filter) {
      const result = await repos.audit.listByFilter(Object.fromEntries(Object.entries(filter)));
      return {
        total: result.total,
        items: result.items.map((item) => ({
          actorId: item.actorId as string,
          action: item.action as string,
          ...(item.entityId ? { entityId: item.entityId as string } : {}),
          ...(item.teamId ? { teamId: item.teamId as string } : {}),
          ...(item.payload ? { metadata: item.payload as Record<string, unknown> } : {}),
          eventVersion: (item.eventVersion ?? 1) as number,
          sourceService: (item.sourceService ?? 'host-local') as string,
          ...(item.requestId ? { requestId: item.requestId as string } : {}),
          ...(item.traceId ? { traceId: item.traceId as string } : {}),
          ...(item.operationId ? { operationId: item.operationId as string } : {}),
          ...(item.causationId ? { causationId: item.causationId as string } : {}),
          outcome: (item.outcome ?? 'success') as 'success' | 'rejected' | 'failed',
          timestamp: item.createdAt as string,
        })),
      };
    },
  };
}
