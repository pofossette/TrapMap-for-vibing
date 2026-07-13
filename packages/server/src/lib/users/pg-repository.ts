/**
 * PostgreSQL-backed implementation of UserRepository.
 *
 * Uses the dedicated users table for user CRUD operations.
 * Uses only the dedicated relational identity table.
 *
 * Phase: 3 (Round 10)
 */

import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';

import { usersTable } from '@trapmap/server/lib/persistence/schema.js';
import type { UserRecord } from '@trapmap/server/lib/store.js';
import type { UserRepository } from './repository.js';

/**
 * Row shape as returned by Drizzle SELECT from users table.
 * Matches the Drizzle schema column names (camelCase).
 */
interface UsersRow {
  id: string;
  handle: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function rowToUserRecord(row: UsersRow): UserRecord {
  return {
    id: row.id,
    handle: row.handle,
    notes: row.notes ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

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
    const rows = await this.db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);

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
    const setClauses: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (updates.handle !== undefined) {
      setClauses.push(`"handle" = $${paramIdx++}`);
      params.push(updates.handle);
    }
    if (updates.notes !== undefined) {
      setClauses.push(`"notes" = $${paramIdx++}`);
      params.push(updates.notes);
    }

    if (setClauses.length === 0) return;

    setClauses.push(`"updated_at" = $${paramIdx++}`);
    params.push(new Date());
    params.push(userId);

    await this.pool.query(
      `UPDATE "users" SET ${setClauses.join(', ')} WHERE "id" = $${paramIdx}`,
      params,
    );
  }
}
