/**
 * PostgreSQL-backed implementation of AuditRepository.
 *
 * Uses the dedicated audit_events table for audit CRUD operations.
 * Does not read from or write to store_snapshot JSONB.
 *
 * Phase: 3 (Round 10)
 */

import { and, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';

import type { AuditEventRecord } from '@trapmap/server/lib/store.js';
import { auditEventsTable } from '@trapmap/server/lib/persistence/schema.js';
import type { AuditRepository } from './repository.js';

export class PgAuditRepository implements AuditRepository {
  private db: ReturnType<typeof drizzle>;

  constructor(private readonly pool: Pool) {
    this.db = drizzle(pool);
  }

  async nextId(): Promise<string> {
    const { rows } = await this.pool.query<{ nextval: string }>(
      "SELECT nextval('audit_event_id_seq') AS nextval",
    );
    return `audit_${rows[0]?.nextval ?? '1'}`;
  }

  async insert(event: AuditEventRecord): Promise<void> {
    await this.db.insert(auditEventsTable).values({
      id: event.id,
      teamId: event.teamId,
      actorId: event.actorId,
      action: event.action,
      entityId: event.entityId,
      payload: event.payload,
      createdAt: new Date(event.createdAt),
      updatedAt: new Date(event.updatedAt),
    });
  }

  async getById(eventId: string): Promise<AuditEventRecord | null> {
    const rows = await this.db
      .select()
      .from(auditEventsTable)
      .where(eq(auditEventsTable.id, eventId))
      .limit(1);

    if (rows.length === 0) return null;
    return rowToAuditEventRecord(rows[0]!);
  }

  async listByFilter(filter: {
    action?: string[];
    actorId?: string;
    entityId?: string;
    teamId?: string;
    from?: string;
    to?: string;
    limit?: number;
  }): Promise<{ items: AuditEventRecord[]; total: number }> {
    const conditions = [];

    if (filter.action && filter.action.length > 0) {
      conditions.push(inArray(auditEventsTable.action, filter.action));
    }
    if (filter.actorId) {
      conditions.push(eq(auditEventsTable.actorId, filter.actorId));
    }
    if (filter.entityId) {
      conditions.push(eq(auditEventsTable.entityId, filter.entityId));
    }
    if (filter.teamId !== undefined) {
      conditions.push(eq(auditEventsTable.teamId, filter.teamId));
    }
    if (filter.from) {
      conditions.push(gte(auditEventsTable.createdAt, new Date(filter.from)));
    }
    if (filter.to) {
      conditions.push(lte(auditEventsTable.createdAt, new Date(filter.to)));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const limit = filter.limit ?? 25;

    const [rows, countResult] = await Promise.all([
      this.db
        .select()
        .from(auditEventsTable)
        .where(where)
        .orderBy(desc(auditEventsTable.createdAt))
        .limit(limit),
      this.db
        .select({ count: this.db.fn.count() })
        .from(auditEventsTable)
        .where(where),
    ]);

    const total = Number(countResult[0]?.count ?? 0);

    return {
      items: rows.map(rowToAuditEventRecord),
      total,
    };
  }
}

function rowToAuditEventRecord(row: Record<string, unknown>): AuditEventRecord {
  return {
    id: row.id as string,
    teamId: (row.teamId as string) ?? null,
    actorId: row.actorId as string,
    action: row.action as string,
    entityId: row.entityId as string,
    payload: (row.payload as Record<string, unknown>) ?? {},
    createdAt: (row.createdAt as Date).toISOString(),
    updatedAt: (row.updatedAt as Date).toISOString(),
  };
}
