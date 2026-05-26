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

import { membershipsTable, teamsTable } from '@trapmap/server/lib/persistence/schema.js';
import type { MembershipRecord, TeamRecord } from '@trapmap/server/lib/store.js';
import type { MembershipRepository, TeamRepository } from './repository.js';

interface TeamsRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface MembershipsRow {
  id: string;
  userId: string;
  teamId: string;
  roleTemplate: string;
  securityLevel: number;
  permissions: string[];
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

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
    const rows = await this.db.select().from(teamsTable).where(eq(teamsTable.id, teamId)).limit(1);

    if (rows.length === 0) return null;
    return rowToTeamRecord(rows[0]!);
  }

  async getBySlug(slug: string): Promise<TeamRecord | null> {
    const rows = await this.db.select().from(teamsTable).where(eq(teamsTable.slug, slug)).limit(1);

    if (rows.length === 0) return null;
    return rowToTeamRecord(rows[0]!);
  }

  async listAll(): Promise<TeamRecord[]> {
    const rows = await this.db.select().from(teamsTable);
    return rows.map(rowToTeamRecord);
  }

  async update(teamId: string, updates: Partial<TeamRecord>): Promise<void> {
    const setClauses: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (updates.name !== undefined) {
      setClauses.push(`"name" = $${paramIdx++}`);
      params.push(updates.name);
    }
    if (updates.slug !== undefined) {
      setClauses.push(`"slug" = $${paramIdx++}`);
      params.push(updates.slug);
    }
    if (updates.description !== undefined) {
      setClauses.push(`"description" = $${paramIdx++}`);
      params.push(updates.description);
    }

    if (setClauses.length === 0) return;

    setClauses.push(`"updated_at" = $${paramIdx++}`);
    params.push(new Date());
    params.push(teamId);

    await this.pool.query(
      `UPDATE "teams" SET ${setClauses.join(', ')} WHERE "id" = $${paramIdx}`,
      params,
    );
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
      .where(and(eq(membershipsTable.userId, userId), eq(membershipsTable.teamId, teamId)))
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
    const setClauses: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (updates.roleTemplate !== undefined) {
      setClauses.push(`"role_template" = $${paramIdx++}`);
      params.push(updates.roleTemplate);
    }
    if (updates.securityLevel !== undefined) {
      setClauses.push(`"security_level" = $${paramIdx++}`);
      params.push(updates.securityLevel);
    }
    if (updates.permissions !== undefined) {
      setClauses.push(`"permissions" = $${paramIdx++}::jsonb`);
      params.push(JSON.stringify(updates.permissions));
    }
    if (updates.notes !== undefined) {
      setClauses.push(`"notes" = $${paramIdx++}`);
      params.push(updates.notes);
    }

    if (setClauses.length === 0) return;

    setClauses.push(`"updated_at" = $${paramIdx++}`);
    params.push(new Date());
    params.push(membershipId);

    await this.pool.query(
      `UPDATE "memberships" SET ${setClauses.join(', ')} WHERE "id" = $${paramIdx}`,
      params,
    );
  }
}

function rowToTeamRecord(row: TeamsRow): TeamRecord {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function rowToMembershipRecord(row: MembershipsRow): MembershipRecord {
  return {
    id: row.id,
    userId: row.userId,
    teamId: row.teamId,
    roleTemplate: row.roleTemplate as MembershipRecord['roleTemplate'],
    securityLevel: row.securityLevel,
    permissions: (row.permissions ?? []) as MembershipRecord['permissions'],
    notes: row.notes ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
