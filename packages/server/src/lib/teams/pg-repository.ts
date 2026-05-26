/**
 * PostgreSQL-backed implementations of TeamRepository and MembershipRepository.
 *
 * Uses dedicated tables (teams, memberships) for team and membership CRUD operations.
 * Does not read from or write to store_snapshot JSONB.
 *
 * Phase: 3 (Round 10)
 */

import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';

import type { MembershipRecord, TeamRecord } from '@trapmap/server/lib/store.js';
import {
  membershipsTable,
  teamsTable,
} from '@trapmap/server/lib/persistence/schema.js';
import type { MembershipRepository, TeamRepository } from './repository.js';

export class PgTeamRepository implements TeamRepository {
  private db: ReturnType<typeof drizzle>;

  constructor(private readonly pool: Pool) {
    this.db = drizzle(pool);
  }

  async nextId(): Promise<string> {
    const { rows } = await this.pool.query<{ nextval: string }>(
      "SELECT nextval('team_id_seq') AS nextval",
    );
    return `team_${rows[0]?.nextval ?? '1'}`;
  }

  async insert(team: TeamRecord): Promise<void> {
    await this.db.insert(teamsTable).values({
      id: team.id,
      slug: team.slug,
      name: team.name,
      description: team.description,
      createdAt: new Date(team.createdAt),
      updatedAt: new Date(team.updatedAt),
    });
  }

  async getById(teamId: string): Promise<TeamRecord | null> {
    const rows = await this.db
      .select()
      .from(teamsTable)
      .where(eq(teamsTable.id, teamId))
      .limit(1);

    if (rows.length === 0) return null;
    return rowToTeamRecord(rows[0]!);
  }

  async getBySlug(slug: string): Promise<TeamRecord | null> {
    const rows = await this.db
      .select()
      .from(teamsTable)
      .where(eq(teamsTable.slug, slug))
      .limit(1);

    if (rows.length === 0) return null;
    return rowToTeamRecord(rows[0]!);
  }

  async listAll(): Promise<TeamRecord[]> {
    const rows = await this.db.select().from(teamsTable);
    return rows.map(rowToTeamRecord);
  }

  async update(teamId: string, updates: Partial<TeamRecord>): Promise<void> {
    const now = new Date();
    const setValues: Record<string, unknown> = { updatedAt: now };

    if (updates.name !== undefined) {
      setValues.name = updates.name;
    }
    if (updates.slug !== undefined) {
      setValues.slug = updates.slug;
    }
    if (updates.description !== undefined) {
      setValues.description = updates.description;
    }

    await this.db
      .update(teamsTable)
      .set(setValues as any)
      .where(eq(teamsTable.id, teamId));
  }
}

export class PgMembershipRepository implements MembershipRepository {
  private db: ReturnType<typeof drizzle>;

  constructor(private readonly pool: Pool) {
    this.db = drizzle(pool);
  }

  async nextId(): Promise<string> {
    const { rows } = await this.pool.query<{ nextval: string }>(
      "SELECT nextval('membership_id_seq') AS nextval",
    );
    return `member_${rows[0]?.nextval ?? '1'}`;
  }

  async insert(membership: MembershipRecord): Promise<void> {
    await this.db.insert(membershipsTable).values({
      id: membership.id,
      userId: membership.userId,
      teamId: membership.teamId,
      roleTemplate: membership.roleTemplate,
      securityLevel: membership.securityLevel,
      permissions: membership.permissions as string[],
      notes: membership.notes,
      createdAt: new Date(membership.createdAt),
      updatedAt: new Date(membership.updatedAt),
    });
  }

  async getById(membershipId: string): Promise<MembershipRecord | null> {
    const rows = await this.db
      .select()
      .from(membershipsTable)
      .where(eq(membershipsTable.id, membershipId))
      .limit(1);

    if (rows.length === 0) return null;
    return rowToMembershipRecord(rows[0]!);
  }

  async findByUserAndTeam(userId: string, teamId: string): Promise<MembershipRecord | null> {
    const rows = await this.db
      .select()
      .from(membershipsTable)
      .where(
        and(
          eq(membershipsTable.userId, userId),
          eq(membershipsTable.teamId, teamId),
        ),
      )
      .limit(1);

    if (rows.length === 0) return null;
    return rowToMembershipRecord(rows[0]!);
  }

  async listByUser(userId: string): Promise<MembershipRecord[]> {
    const rows = await this.db
      .select()
      .from(membershipsTable)
      .where(eq(membershipsTable.userId, userId));

    return rows.map(rowToMembershipRecord);
  }

  async listByTeam(teamId: string): Promise<MembershipRecord[]> {
    const rows = await this.db
      .select()
      .from(membershipsTable)
      .where(eq(membershipsTable.teamId, teamId));

    return rows.map(rowToMembershipRecord);
  }

  async update(membershipId: string, updates: Partial<MembershipRecord>): Promise<void> {
    const now = new Date();
    const setValues: Record<string, unknown> = { updatedAt: now };

    if (updates.roleTemplate !== undefined) {
      setValues.roleTemplate = updates.roleTemplate;
    }
    if (updates.securityLevel !== undefined) {
      setValues.securityLevel = updates.securityLevel;
    }
    if (updates.permissions !== undefined) {
      setValues.permissions = updates.permissions as string[];
    }
    if (updates.notes !== undefined) {
      setValues.notes = updates.notes;
    }

    await this.db
      .update(membershipsTable)
      .set(setValues as any)
      .where(eq(membershipsTable.id, membershipId));
  }
}

function rowToTeamRecord(row: Record<string, unknown>): TeamRecord {
  return {
    id: row.id as string,
    slug: row.slug as string,
    name: row.name as string,
    description: (row.description as string) ?? null,
    createdAt: (row.createdAt as Date).toISOString(),
    updatedAt: (row.updatedAt as Date).toISOString(),
  };
}

function rowToMembershipRecord(row: Record<string, unknown>): MembershipRecord {
  return {
    id: row.id as string,
    userId: row.userId as string,
    teamId: row.teamId as string,
    roleTemplate: row.roleTemplate as MembershipRecord['roleTemplate'],
    securityLevel: row.securityLevel as number,
    permissions: (row.permissions as MembershipRecord['permissions']) ?? [],
    notes: (row.notes as string) ?? null,
    createdAt: (row.createdAt as Date).toISOString(),
    updatedAt: (row.updatedAt as Date).toISOString(),
  };
}
