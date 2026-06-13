/**
 * PostgreSQL-backed implementation of FeedbackRepository.
 *
 * Uses structured feedback_records and feedback_custom_answers tables
 * instead of the feedbackQueue array inside store_snapshot JSONB.
 *
 * Round 6: Structural Refactoring
 */

import { randomUUID } from 'node:crypto';

import { and, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';

import { feedbackCustomAnswers, feedbackRecords } from '@trapmap/server/lib/persistence/schema.js';
import type { FeedbackQueueRecord } from '@trapmap/server/lib/store.js';
import type { FeedbackRepository } from './repository.js';

/**
 * PostgreSQL-backed repository for feedback CRUD operations.
 */
export class PgFeedbackRepository implements FeedbackRepository {
  private db: ReturnType<typeof drizzle>;

  constructor(pool: Pool) {
    this.db = drizzle(pool, { schema: { feedbackRecords, feedbackCustomAnswers } });
  }

  async nextId(): Promise<string> {
    return `feedback_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  }

  async insert(feedback: FeedbackQueueRecord): Promise<void> {
    await this.db.insert(feedbackRecords).values({
      id: feedback.id,
      entryId: feedback.entryId,
      entryType: feedback.entryType,
      problemType: feedback.problemType,
      description: feedback.description,
      context: feedback.context,
      querySeed: feedback.querySeed,
      queryId: feedback.queryId,
      routeFamily: feedback.routeFamily,
      failureClassification: feedback.failureClassification,
      expectedCorrection: feedback.expectedCorrection,
      selectedResultSnapshot: feedback.selectedResultSnapshot,
      submittedAt: new Date(feedback.submittedAt),
      submittedByUserId: feedback.submittedByUserId,
      submittedByHandle: feedback.submittedByHandle,
      status: feedback.status,
      adminNotes: feedback.adminNotes,
      resolvedAt: feedback.resolvedAt ? new Date(feedback.resolvedAt) : null,
      resolvedByUserId: feedback.resolvedByUserId,
      triggeredTransition: feedback.triggeredTransition,
      remediationStatus: feedback.remediationStatus ?? null,
      remediationOpenedAt: feedback.remediationOpenedAt
        ? new Date(feedback.remediationOpenedAt)
        : null,
      remediationOpenedByUserId: feedback.remediationOpenedByUserId ?? null,
      remediationResolvedAt: feedback.remediationResolvedAt
        ? new Date(feedback.remediationResolvedAt)
        : null,
      remediationResolvedByUserId: feedback.remediationResolvedByUserId ?? null,
      createdAt: new Date(feedback.createdAt),
      updatedAt: new Date(feedback.updatedAt),
    });

    if (feedback.customAnswers && feedback.customAnswers.length > 0) {
      await this.db.insert(feedbackCustomAnswers).values(
        feedback.customAnswers.map((a) => ({
          feedbackId: feedback.id,
          questionKey: a.prompt,
          answerText: a.answer,
        })),
      );
    }
  }

  async getById(feedbackId: string): Promise<FeedbackQueueRecord | null> {
    const result = await this.db
      .select()
      .from(feedbackRecords)
      .where(eq(feedbackRecords.id, feedbackId))
      .limit(1);

    if (result.length === 0) return null;

    const row = result[0]!;
    const customAnswers = await this.getCustomAnswers(feedbackId);
    return rowToFeedbackRecord(row, customAnswers);
  }

  async listByEntry(entryId: string): Promise<FeedbackQueueRecord[]> {
    const rows = await this.db
      .select()
      .from(feedbackRecords)
      .where(eq(feedbackRecords.entryId, entryId));

    return this.hydrateRows(rows);
  }

  async listByStatus(status: string): Promise<FeedbackQueueRecord[]> {
    const rows = await this.db
      .select()
      .from(feedbackRecords)
      .where(eq(feedbackRecords.status, status));

    return this.hydrateRows(rows);
  }

  async listByFilter(filter: {
    status?: string[];
    problemType?: string[];
    entryId?: string;
    entryType?: string;
  }): Promise<FeedbackQueueRecord[]> {
    const conditions = [];

    if (filter.status && filter.status.length > 0) {
      conditions.push(inArray(feedbackRecords.status, filter.status));
    }
    if (filter.problemType && filter.problemType.length > 0) {
      conditions.push(inArray(feedbackRecords.problemType, filter.problemType));
    }
    if (filter.entryId) {
      conditions.push(eq(feedbackRecords.entryId, filter.entryId));
    }
    if (filter.entryType) {
      conditions.push(eq(feedbackRecords.entryType, filter.entryType));
    }

    const query =
      conditions.length > 0
        ? this.db
            .select()
            .from(feedbackRecords)
            .where(and(...conditions))
        : this.db.select().from(feedbackRecords);

    const rows = await query;
    return this.hydrateRows(rows);
  }

  async update(feedbackId: string, updates: Partial<FeedbackQueueRecord>): Promise<void> {
    const setValues: Record<string, unknown> = {};
    if (updates.status !== undefined) setValues.status = updates.status;
    if (updates.adminNotes !== undefined) setValues.adminNotes = updates.adminNotes;
    if (updates.resolvedAt !== undefined)
      setValues.resolvedAt = updates.resolvedAt ? new Date(updates.resolvedAt) : null;
    if (updates.resolvedByUserId !== undefined)
      setValues.resolvedByUserId = updates.resolvedByUserId;
    if (updates.triggeredTransition !== undefined)
      setValues.triggeredTransition = updates.triggeredTransition;
    if (updates.description !== undefined) setValues.description = updates.description;
    if (updates.context !== undefined) setValues.context = updates.context;
    if (updates.querySeed !== undefined) setValues.querySeed = updates.querySeed;
    if (updates.queryId !== undefined) setValues.queryId = updates.queryId;
    if (updates.routeFamily !== undefined) setValues.routeFamily = updates.routeFamily;
    if (updates.failureClassification !== undefined)
      setValues.failureClassification = updates.failureClassification;
    if (updates.expectedCorrection !== undefined)
      setValues.expectedCorrection = updates.expectedCorrection;
    if (updates.selectedResultSnapshot !== undefined)
      setValues.selectedResultSnapshot = updates.selectedResultSnapshot;
    if (updates.remediationStatus !== undefined)
      setValues.remediationStatus = updates.remediationStatus;
    if (updates.remediationOpenedAt !== undefined)
      setValues.remediationOpenedAt = updates.remediationOpenedAt
        ? new Date(updates.remediationOpenedAt)
        : null;
    if (updates.remediationOpenedByUserId !== undefined)
      setValues.remediationOpenedByUserId = updates.remediationOpenedByUserId;
    if (updates.remediationResolvedAt !== undefined)
      setValues.remediationResolvedAt = updates.remediationResolvedAt
        ? new Date(updates.remediationResolvedAt)
        : null;
    if (updates.remediationResolvedByUserId !== undefined)
      setValues.remediationResolvedByUserId = updates.remediationResolvedByUserId;

    setValues.updatedAt = new Date();

    await this.db.update(feedbackRecords).set(setValues).where(eq(feedbackRecords.id, feedbackId));
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async getCustomAnswers(
    feedbackId: string,
  ): Promise<Array<{ prompt: string; answer: string }>> {
    const rows = await this.db
      .select()
      .from(feedbackCustomAnswers)
      .where(eq(feedbackCustomAnswers.feedbackId, feedbackId));

    return rows.map((r) => ({
      prompt: r.questionKey,
      answer: r.answerText,
    }));
  }

  private async hydrateRows(
    rows: Array<{
      id: string;
      entryId: string;
      entryType: string;
      problemType: string;
      description: string;
      context: string | null;
      querySeed: string | null;
      queryId: string | null;
      routeFamily: string | null;
      failureClassification: string | null;
      expectedCorrection: string | null;
      selectedResultSnapshot: Record<string, unknown> | null;
      submittedAt: Date;
      submittedByUserId: string;
      submittedByHandle: string;
      status: string;
      adminNotes: string | null;
      resolvedAt: Date | null;
      resolvedByUserId: string | null;
      triggeredTransition: string | null;
      remediationStatus: string | null;
      remediationOpenedAt: Date | null;
      remediationOpenedByUserId: string | null;
      remediationResolvedAt: Date | null;
      remediationResolvedByUserId: string | null;
      createdAt: Date;
      updatedAt: Date;
    }>,
  ): Promise<FeedbackQueueRecord[]> {
    if (rows.length === 0) return [];

    const ids = rows.map((r) => r.id);
    const allAnswers = await this.db
      .select()
      .from(feedbackCustomAnswers)
      .where(inArray(feedbackCustomAnswers.feedbackId, ids));

    const answersByFeedbackId = new Map<string, Array<{ prompt: string; answer: string }>>();
    for (const ans of allAnswers) {
      const list = answersByFeedbackId.get(ans.feedbackId) ?? [];
      list.push({ prompt: ans.questionKey, answer: ans.answerText });
      answersByFeedbackId.set(ans.feedbackId, list);
    }

    return rows.map((row) => rowToFeedbackRecord(row, answersByFeedbackId.get(row.id) ?? []));
  }
}

// =============================================================================
// Row mapping helpers
// =============================================================================

interface FeedbackRecordRow {
  id: string;
  entryId: string;
  entryType: string;
  problemType: string;
  description: string;
  context: string | null;
  querySeed: string | null;
  queryId: string | null;
  routeFamily: string | null;
  failureClassification: string | null;
  expectedCorrection: string | null;
  selectedResultSnapshot: Record<string, unknown> | null;
  submittedAt: Date;
  submittedByUserId: string;
  submittedByHandle: string;
  status: string;
  adminNotes: string | null;
  resolvedAt: Date | null;
  resolvedByUserId: string | null;
  triggeredTransition: string | null;
  remediationStatus: string | null;
  remediationOpenedAt: Date | null;
  remediationOpenedByUserId: string | null;
  remediationResolvedAt: Date | null;
  remediationResolvedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function rowToFeedbackRecord(
  row: FeedbackRecordRow,
  customAnswers: Array<{ prompt: string; answer: string }>,
): FeedbackQueueRecord {
  return {
    id: row.id,
    entryId: row.entryId,
    entryType: row.entryType as 'trap' | 'skill',
    problemType: row.problemType as FeedbackQueueRecord['problemType'],
    description: row.description,
    context: row.context,
    querySeed: row.querySeed,
    queryId: row.queryId,
    routeFamily: row.routeFamily as FeedbackQueueRecord['routeFamily'],
    failureClassification: row.failureClassification as FeedbackQueueRecord['failureClassification'],
    expectedCorrection: row.expectedCorrection,
    selectedResultSnapshot: row.selectedResultSnapshot,
    submittedAt: row.submittedAt.toISOString(),
    submittedByUserId: row.submittedByUserId,
    submittedByHandle: row.submittedByHandle,
    status: row.status as FeedbackQueueRecord['status'],
    adminNotes: row.adminNotes,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    resolvedByUserId: row.resolvedByUserId,
    triggeredTransition: row.triggeredTransition,
    remediationStatus: (row.remediationStatus as FeedbackQueueRecord['remediationStatus']) ?? null,
    remediationOpenedAt: row.remediationOpenedAt?.toISOString() ?? null,
    remediationOpenedByUserId: row.remediationOpenedByUserId,
    remediationResolvedAt: row.remediationResolvedAt?.toISOString() ?? null,
    remediationResolvedByUserId: row.remediationResolvedByUserId,
    customAnswers: customAnswers.length > 0 ? customAnswers : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
