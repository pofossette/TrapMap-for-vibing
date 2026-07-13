export interface CreateAuditEventArgs<TSnapshot> {
  store: { nextId(data: TSnapshot, kind: 'audit'): string };
  data: TSnapshot;
  teamId: string | null;
  actor: { actorId: string };
  action: string;
  entityId: string;
  payload: Record<string, unknown>;
}

export function createAuditEvent<TSnapshot>(args: CreateAuditEventArgs<TSnapshot>) {
  const createdAt = new Date().toISOString();
  return {
    id: args.store.nextId(args.data, 'audit'),
    teamId: args.teamId,
    actorId: args.actor.actorId,
    action: args.action,
    entityId: args.entityId,
    payload: args.payload,
    createdAt,
    updatedAt: createdAt,
  };
}
