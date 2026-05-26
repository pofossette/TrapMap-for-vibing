/**
 * PostgreSQL-backed implementations of SessionRepository and AccessKeyRepository.
 *
 * Uses dedicated tables (sessions, access_keys) for auth operations.
 * Does not read from or write to store_snapshot JSONB.
 *
 * Phase: 3 (Round 10)
 */

import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';

import type { AccessKeyRecord, SessionRecord } from '@trapmap/server/lib/store.js';
import {
  accessKeysTable,
  sessionsTable,
} from '@trapmap/server/lib/persistence/schema.js';
import type { AccessKeyRepository, SessionRepository } from './repository.js';

interface SessionsRow {
  id: string;
  tokenHash: string;
  userId: string | null;
  activeTeamId: string | null;
  subjectType: string;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface AccessKeysRow {
  id: string;
  memberId: string;
  tokenHash: string;
  tokenPreview: string;
  issuedByUserId: string;
  teamId: string;
  level: number;
  notes: string | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class PgSessionRepository implements SessionRepository {
  private db: ReturnType<typeof drizzle>;

  constructor(private readonly pool: Pool) {
    this.db = drizzle(pool);
  }

  async nextId(): Promise<string> {
    const { rows } = await this.pool.query<{ nextval: string }>(
      "SELECT nextval('session_id_seq') AS nextval",
    );
    return `session_${rows[0]?.nextval ?? '1'}`;
  }

  async create(
    session: Omit<SessionRecord, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<SessionRecord> {
    const id = await this.nextId();
    const now = new Date();

    await this.db.insert(sessionsTable).values({
      id,
      tokenHash: session.tokenHash,
      userId: session.userId,
      activeTeamId: session.activeTeamId,
      subjectType: session.subjectType,
      expiresAt: session.expiresAt ? new Date(session.expiresAt) : null,
      createdAt: now,
      updatedAt: now,
    });

    return {
      id,
      subjectType: session.subjectType as SessionRecord['subjectType'],
      userId: session.userId,
      activeTeamId: session.activeTeamId,
      tokenHash: session.tokenHash,
      expiresAt: session.expiresAt,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
  }

  async getByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    const rows = await this.db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.tokenHash, tokenHash))
      .limit(1);

    if (rows.length === 0) return null;
    return rowToSessionRecord(rows[0]!);
  }

  async deleteByTokenHash(tokenHash: string): Promise<void> {
    await this.db.delete(sessionsTable).where(eq(sessionsTable.tokenHash, tokenHash));
  }

  async updateActiveTeam(sessionId: string, teamId: string | null): Promise<SessionRecord> {
    const now = new Date();

    const result = await this.db
      .update(sessionsTable)
      .set({ activeTeamId: teamId, updatedAt: now })
      .where(eq(sessionsTable.id, sessionId))
      .returning();

    if (result.length === 0) {
      throw new Error(`Session ${sessionId} not found`);
    }

    return rowToSessionRecord(result[0]!);
  }
}

export class PgAccessKeyRepository implements AccessKeyRepository {
  private db: ReturnType<typeof drizzle>;

  constructor(private readonly pool: Pool) {
    this.db = drizzle(pool);
  }

  private async nextId(): Promise<string> {
    const { rows } = await this.pool.query<{ nextval: string }>(
      "SELECT nextval('access_key_id_seq') AS nextval",
    );
    return `access_${rows[0]?.nextval ?? '1'}`;
  }

  async insert(key: AccessKeyRecord): Promise<void> {
    await this.db.insert(accessKeysTable).values({
      id: key.id,
      memberId: key.memberId,
      tokenHash: key.tokenHash,
      tokenPreview: key.tokenPreview,
      issuedByUserId: key.issuedByUserId,
      teamId: key.teamId,
      level: key.level,
      notes: key.notes,
      revokedAt: key.revokedAt ? new Date(key.revokedAt) : null,
      createdAt: new Date(key.createdAt),
      updatedAt: new Date(key.updatedAt),
    });
  }

  async getByTokenHash(tokenHash: string): Promise<AccessKeyRecord | null> {
    const rows = await this.db
      .select()
      .from(accessKeysTable)
      .where(eq(accessKeysTable.tokenHash, tokenHash))
      .limit(1);

    if (rows.length === 0) return null;
    return rowToAccessKeyRecord(rows[0]!);
  }

  async getById(keyId: string): Promise<AccessKeyRecord | null> {
    const rows = await this.db
      .select()
      .from(accessKeysTable)
      .where(eq(accessKeysTable.id, keyId))
      .limit(1);

    if (rows.length === 0) return null;
    return rowToAccessKeyRecord(rows[0]!);
  }

  async revoke(keyId: string): Promise<void> {
    const now = new Date();

    await this.db
      .update(accessKeysTable)
      .set({ revokedAt: now, updatedAt: now })
      .where(eq(accessKeysTable.id, keyId));
  }

  async listByMember(memberId: string): Promise<AccessKeyRecord[]> {
    const rows = await this.db
      .select()
      .from(accessKeysTable)
      .where(eq(accessKeysTable.memberId, memberId));

    return rows.map(rowToAccessKeyRecord);
  }
}

function rowToSessionRecord(row: SessionsRow): SessionRecord {
  return {
    id: row.id,
    subjectType: row.subjectType as SessionRecord['subjectType'],
    userId: row.userId,
    activeTeamId: row.activeTeamId,
    tokenHash: row.tokenHash,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function rowToAccessKeyRecord(row: AccessKeysRow): AccessKeyRecord {
  return {
    id: row.id,
    memberId: row.memberId,
    tokenHash: row.tokenHash,
    tokenPreview: row.tokenPreview,
    issuedByUserId: row.issuedByUserId,
    teamId: row.teamId,
    level: row.level,
    notes: row.notes ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
