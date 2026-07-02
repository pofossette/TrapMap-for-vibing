import type { AuditEvent } from '@trapmap/contracts';

import type { SkillShareerStore, StoreData } from './store.js';
import { nowIso } from './store.js';

import type { ResolvedAuthContext } from './context.js';

export interface CreateAuditEventArgs {
  store: SkillShareerStore;
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

export function toAuditEvent(
  record: {
    id: string;
    teamId: string | null;
    actorId: string;
    action: string;
    entityId: string;
    payload: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
  },
  data: StoreData,
): AuditEvent {
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
