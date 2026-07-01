/**
 * SQL query builders for the PostgreSQL duplicate detector.
 *
 * Extracted from pg-detector.ts to keep the orchestration layer thin.
 * Each function returns a drizzle query builder that the caller awaits.
 *
 * @module candidates/pg-detector-queries
 */

import { and, eq, or, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import {
  knowledgeEmbeddings,
  knowledgeEntries,
  knowledgeKeywords,
  skillArtifactCapsuleEmbeddings,
  skillArtifactCapsuleKeywords,
  skillArtifactProfiles,
  skillArtifacts,
} from '@trapmap/server/lib/persistence/schema.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Minimal drizzle DB type — avoids coupling to the full schema generic.
 * We only need the `.select()` chainable.
 */
export type DrizzleDb = NodePgDatabase<Record<string, unknown>>;

// ---------------------------------------------------------------------------
// Team filters
// ---------------------------------------------------------------------------

export function buildTrapVectorTeamFilter(teamId: string | null) {
  return teamId !== null
    ? sql`(${knowledgeEmbeddings.teamId} IS NULL OR ${knowledgeEmbeddings.teamId} = ${teamId})`
    : sql`${knowledgeEmbeddings.teamId} IS NULL`;
}

export function buildTrapKeywordTeamFilter(teamId: string | null) {
  return teamId !== null
    ? sql`(${knowledgeKeywords.teamId} IS NULL OR ${knowledgeKeywords.teamId} = ${teamId})`
    : sql`${knowledgeKeywords.teamId} IS NULL`;
}

export function buildSkillEmbeddingTeamFilter(teamId: string | null) {
  return teamId !== null
    ? sql`(${skillArtifactCapsuleEmbeddings.teamId} IS NULL OR ${skillArtifactCapsuleEmbeddings.teamId} = ${teamId})`
    : sql`${skillArtifactCapsuleEmbeddings.teamId} IS NULL`;
}

export function buildSkillKeywordTeamFilter(teamId: string | null) {
  return teamId !== null
    ? sql`(${skillArtifactCapsuleKeywords.teamId} IS NULL OR ${skillArtifactCapsuleKeywords.teamId} = ${teamId})`
    : sql`${skillArtifactCapsuleKeywords.teamId} IS NULL`;
}

// ---------------------------------------------------------------------------
// Exact-match query (skill profiles by contentHash / sourceHash)
// ---------------------------------------------------------------------------

export interface SkillExactRow {
  artifactId: string;
  title: string;
  summary: string;
}

export async function querySkillExactMatches(
  db: DrizzleDb,
  teamId: string | null,
  candidateExactLookupKey: string,
): Promise<SkillExactRow[]> {
  const rows = await db
    .select({
      artifactId: skillArtifactProfiles.artifactId,
      title: skillArtifactProfiles.title,
      summary: skillArtifactProfiles.summary,
    })
    .from(skillArtifactProfiles)
    .innerJoin(skillArtifacts, eq(skillArtifactProfiles.artifactId, skillArtifacts.id))
    .where(
      and(
        eq(skillArtifacts.lifecycleState, 'approved'),
        teamId !== null
          ? or(eq(skillArtifacts.teamId, teamId), sql`${skillArtifacts.teamId} IS NULL`)
          : sql`${skillArtifacts.teamId} IS NULL`,
        or(
          eq(skillArtifactProfiles.contentHash, candidateExactLookupKey),
          eq(skillArtifactProfiles.sourceHash, candidateExactLookupKey),
        ),
      ),
    );

  return rows as SkillExactRow[];
}

// ---------------------------------------------------------------------------
// Vector similarity search
// ---------------------------------------------------------------------------

export interface TrapVectorRow {
  entryId: string;
  entryTitle: string;
  entryBody: string;
  distance: number;
}

export async function queryTrapVectorMatches(
  db: DrizzleDb,
  vectorLiteral: string,
  teamFilter: ReturnType<typeof sql>,
  limit: number,
): Promise<TrapVectorRow[]> {
  const rows = await db
    .select({
      entryId: knowledgeEmbeddings.entryId,
      entryTitle: knowledgeEntries.shortcut,
      entryBody: knowledgeEntries.detail,
      distance: sql<number>`(${knowledgeEmbeddings.vector} <=> ${sql.raw(`'${vectorLiteral}'::vector`)})`,
    })
    .from(knowledgeEmbeddings)
    .innerJoin(knowledgeEntries, eq(knowledgeEmbeddings.entryId, knowledgeEntries.id))
    .where(
      and(
        eq(knowledgeEmbeddings.status, 'synced'),
        eq(knowledgeEntries.lifecycleState, 'approved'),
        teamFilter,
      ),
    )
    .orderBy(sql`${knowledgeEmbeddings.vector} <=> ${sql.raw(`'${vectorLiteral}'::vector`)}`)
    .limit(limit);

  return rows as TrapVectorRow[];
}

export interface SkillVectorRow {
  artifactId: string;
  artifactTitle: string;
  artifactBody: string;
  distance: number;
}

export async function querySkillVectorMatches(
  db: DrizzleDb,
  vectorLiteral: string,
  teamFilter: ReturnType<typeof sql>,
  limit: number,
): Promise<SkillVectorRow[]> {
  const rows = await db
    .select({
      artifactId: skillArtifactCapsuleEmbeddings.artifactId,
      artifactTitle: skillArtifactProfiles.title,
      artifactBody: skillArtifactProfiles.summary,
      distance: sql<number>`(${skillArtifactCapsuleEmbeddings.embedding} <=> ${sql.raw(`'${vectorLiteral}'::vector`)})`,
    })
    .from(skillArtifactCapsuleEmbeddings)
    .innerJoin(skillArtifacts, eq(skillArtifactCapsuleEmbeddings.artifactId, skillArtifacts.id))
    .innerJoin(
      skillArtifactProfiles,
      and(
        eq(skillArtifactCapsuleEmbeddings.artifactId, skillArtifactProfiles.artifactId),
        eq(skillArtifactCapsuleEmbeddings.revisionNo, skillArtifactProfiles.revisionNo),
      ),
    )
    .where(
      and(
        eq(skillArtifactCapsuleEmbeddings.status, 'synced'),
        eq(skillArtifacts.lifecycleState, 'approved'),
        teamFilter,
      ),
    )
    .orderBy(
      sql`${skillArtifactCapsuleEmbeddings.embedding} <=> ${sql.raw(`'${vectorLiteral}'::vector`)}`,
    )
    .limit(limit);

  return rows as SkillVectorRow[];
}

// ---------------------------------------------------------------------------
// Keyword (token array overlap) search
// ---------------------------------------------------------------------------

export interface TrapKeywordRow {
  entryId: string;
  entryTitle: string;
  entryBody: string;
}

export async function queryTrapKeywordMatches(
  db: DrizzleDb,
  candidateTokens: string[],
  teamFilter: ReturnType<typeof sql>,
  limit: number,
): Promise<TrapKeywordRow[]> {
  if (candidateTokens.length === 0) return [];

  const tokenArray = candidateTokens.map((t) => `'${t}'`).join(',');

  const rows = await db
    .select({
      entryId: knowledgeKeywords.entryId,
      entryTitle: knowledgeEntries.shortcut,
      entryBody: knowledgeEntries.detail,
    })
    .from(knowledgeKeywords)
    .innerJoin(knowledgeEntries, eq(knowledgeKeywords.entryId, knowledgeEntries.id))
    .where(
      and(
        eq(knowledgeKeywords.status, 'synced'),
        eq(knowledgeEntries.lifecycleState, 'approved'),
        teamFilter,
        sql`${knowledgeKeywords.tokens} && ${sql.raw(`ARRAY[${tokenArray}]::text[]`)}`,
      ),
    )
    .limit(limit);

  return rows as TrapKeywordRow[];
}

export interface SkillKeywordRow {
  artifactId: string;
  artifactTitle: string;
  artifactBody: string;
}

export async function querySkillKeywordMatches(
  db: DrizzleDb,
  candidateTokens: string[],
  teamFilter: ReturnType<typeof sql>,
  limit: number,
): Promise<SkillKeywordRow[]> {
  if (candidateTokens.length === 0) return [];

  const tokenArray = candidateTokens.map((t) => `'${t}'`).join(',');

  const rows = await db
    .select({
      artifactId: skillArtifactCapsuleKeywords.artifactId,
      artifactTitle: skillArtifactProfiles.title,
      artifactBody: skillArtifactProfiles.summary,
    })
    .from(skillArtifactCapsuleKeywords)
    .innerJoin(skillArtifacts, eq(skillArtifactCapsuleKeywords.artifactId, skillArtifacts.id))
    .innerJoin(
      skillArtifactProfiles,
      and(
        eq(skillArtifactCapsuleKeywords.artifactId, skillArtifactProfiles.artifactId),
        eq(skillArtifactCapsuleKeywords.revisionNo, skillArtifactProfiles.revisionNo),
      ),
    )
    .where(
      and(
        eq(skillArtifactCapsuleKeywords.status, 'synced'),
        eq(skillArtifacts.lifecycleState, 'approved'),
        teamFilter,
        sql`${skillArtifactCapsuleKeywords.tokens} && ${sql.raw(`ARRAY[${tokenArray}]::text[]`)}`,
      ),
    )
    .limit(limit);

  return rows as SkillKeywordRow[];
}
