/**
 * PostgreSQL-backed implementation of UserRepository.
 *
 * Uses the dedicated users table for user CRUD operations.
 * Does not read from or write to store_snapshot JSONB.
 *
 * Phase: 3 (Round 10)
 */

import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';

import type { UserRecord } from '@trapmap/server/lib/store.js';
import { usersTable } from '@trapmap/server/lib/persistence/schema.js';
import type { UserRepository } from './repository.js';

export class PgUserRepository implements UserRepository {
  private db: ReturnType<typeof drizzle>;

  constructor(private readonly pool: Pool) {
    this.db = drizzle(pool);
  }

  async nextId(): Promise<string> {
    const { rows } = await this.pool.query<{ nextval: string }>(
      "SELECT nextval('user_id_seq') AS nextval",
    );
    return `user_${rows[0]?.nextval ?? '1'}`;
  }

  async insert(user: UserRecord): Promise<void> {
    await this.db.insert(usersTable).values({
      id: user.id,
      handle: user.handle,
      notes: user.notes,
      createdAt: new Date(user.createdAt),
      updatedAt: new Date(user.updatedAt),
    });
  }

  async getById(userId: string): Promise<UserRecord | null> {
    const rows = await this.db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    if (rows.length === 0) return null;
    return rowToUserRecord(rows[0]!);
  }

  async getByHandle(handle: string): Promise<UserRecord | null> {
    const rows = await this.db
      .select()
      .from(usersTable)
      .where(eq(usersTable.handle, handle))
      .limit(1);

    if (rows.length === 0) return null;
    return rowToUserRecord(rows[0]!);
  }

  async update(userId: string, updates: Partial<UserRecord>): Promise<void> {
    const now = new Date();
    const setValues: Record<string, unknown> = { updatedAt: now };

    if (updates.handle !== undefined) {
      setValues.handle = updates.handle;
    }
    if (updates.notes !== undefined) {
      setValues.notes = updates.notes;
    }

    await this.db
      .update(usersTable)
      .set(setValues as any)
      .where(eq(usersTable.id, userId));
  }
}

function rowToUserRecord(row: Record<string, unknown>): UserRecord {
  return {
    id: row.id as string,
    handle: row.handle as string,
    notes: (row.notes as string) ?? null,
    createdAt: (row.createdAt as Date).toISOString(),
    updatedAt: (row.updatedAt as Date).toISOString(),
  };
}
