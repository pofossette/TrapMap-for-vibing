import type { AuditEvent } from '@skill-shareer/contracts';

import type { JsonStore, StoreData } from './store.js';
import { nowIso } from './store.js';

import type { ResolvedAuthContext } from './context.js';

export interface CreateAuditEventArgs {
  store: JsonStore;
  data: StoreData;
  teamId: string | null;
  actor: ResolvedAuthContext;
  action: string;
  entityId: string;
  payload: Record<string, unknown>;
}

export function createAuditEvent(args: CreateAuditEventArgs) {
  const id = args.store.nextId(args.data, 'audit');
  const createdAt = nowIso();
  const updatedAt = createdAt;

  return {
    id,
    teamId: args.teamId,
    actorId: args.actor.actorId,
    action: args.action,
    entityId: args.entityId,
    payload: args.payload,
    createdAt,
    updatedAt,
  };
}

export function toAuditEvent(record: { id: string; teamId: string | null; actorId: string; action: string; entityId: string; payload: Record<string, unknown>; createdAt: string; updatedAt: string }, data: StoreData): AuditEvent {
  const actorUser = data.users.find((candidate) => candidate.id === record.actorId);

  return {
    id: record.id,
    teamId: record.teamId,
    actor: {
      id: record.actorId,
      handle: actorUser?.handle ?? record.actorId,
      securityLevel: 0, // Default - can be enhanced if needed
    },
    action: record.action as AuditEvent['action'],
    entityId: record.entityId,
    payload: record.payload,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export interface QueryAuditEventsArgs {
  data: StoreData;
  query: {
    action?: string[];
    actorId?: string;
    entityId?: string;
    teamId?: string;
    from?: string;
    to?: string;
    limit?: number;
  };
  auth: ResolvedAuthContext;
}

export function queryAuditEvents(args: QueryAuditEventsArgs): { items: typeof args.data.auditEvents; total: number } {
  let events = args.data.auditEvents;

  // Filter by action types
  if (args.query.action && args.query.action.length > 0) {
    const actionSet = new Set(args.query.action);
    events = events.filter((event) => actionSet.has(event.action));
  }

  // Filter by actorId
  if (args.query.actorId) {
    events = events.filter((event) => event.actorId === args.query.actorId);
  }

  // Filter by entityId
  if (args.query.entityId) {
    events = events.filter((event) => event.entityId === args.query.entityId);
  }

  // Filter by teamId (or use auth.activeTeamId)
  const targetTeamId = args.query.teamId ?? args.auth.activeTeamId;
  if (targetTeamId !== undefined) {
    events = events.filter((event) => event.teamId === targetTeamId);
  }

  // Filter by date range
  const fromDate = args.query.from;
  if (fromDate) {
    events = events.filter((event) => event.createdAt >= fromDate);
  }

  const toDate = args.query.to;
  if (toDate) {
    events = events.filter((event) => event.createdAt <= toDate);
  }

  // For non-system-admin: only show events for teams where user is member, or global events
  if (args.auth.subjectType !== 'system-admin') {
    const userTeamIds = new Set(
      args.data.memberships
        .filter((m) => m.userId === args.auth.user?.id)
        .map((m) => m.teamId)
    );

    events = events.filter((event) => {
      // Show global events (teamId is null) or events for user's teams
      return event.teamId === null || userTeamIds.has(event.teamId);
    });
  }

  // Sort by createdAt descending
  events.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  // Apply limit
  const limit = args.query.limit ?? 25;
  const total = events.length;
  events = events.slice(0, limit);

  return { items: events, total };
}
