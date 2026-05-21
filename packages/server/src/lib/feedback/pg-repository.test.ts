/**
 * Tests for PgFeedbackRepository.
 *
 * These tests require a PostgreSQL database connection.
 * Set DATABASE_URL or TRAPMAP_DATABASE_URL environment variable to run.
 *
 * Round 6: Structural Refactoring
 */

import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { FeedbackQueueRecord } from '../store.js';
import { PgFeedbackRepository } from './pg-repository.js';

const DATABASE_URL = process.env.TRAPMAP_DATABASE_URL || process.env.DATABASE_URL;
const describeIfDb = DATABASE_URL ? describe : describe.skip;

let pool: Pool | null = null;

async function getPool(): Promise<Pool | null> {
  if (!DATABASE_URL) return null;
  if (pool) return pool;
  pool = new Pool({ connectionString: DATABASE_URL });
  return pool;
}

function createTestFeedbackRecord(
  overrides: Partial<FeedbackQueueRecord> = {},
): FeedbackQueueRecord {
  return {
    id: 'feedback_test_1',
    entryId: 'entry_test_1',
    entryType: 'trap',
    problemType: 'incorrect',
    description: 'This knowledge is incorrect',
    context: 'I was trying to fix a bug',
    querySeed: null,
    customAnswers: null,
    submittedAt: new Date().toISOString(),
    submittedByUserId: 'user_test_1',
    submittedByHandle: 'testuser',
    status: 'new',
    adminNotes: null,
    resolvedAt: null,
    resolvedByUserId: null,
    triggeredTransition: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describeIfDb('PgFeedbackRepository', () => {
  let repo: PgFeedbackRepository;
  let testPool: Pool;

  beforeAll(async () => {
    testPool = (await getPool())!;
    repo = new PgFeedbackRepository(testPool);
  });

  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
  });

  beforeEach(async () => {
    // Clean up test data before each test
    await testPool.query(
      "DELETE FROM feedback_custom_answers WHERE feedback_id LIKE 'feedback_test_%'",
    );
    await testPool.query("DELETE FROM feedback_records WHERE id LIKE 'feedback_test_%'");
  });

  describe('nextId', () => {
    it('should generate a string with feedback_ prefix', async () => {
      const id = await repo.nextId();
      expect(typeof id).toBe('string');
      expect(id).toMatch(/^feedback_/);
    });
  });

  describe('insert', () => {
    it('should insert a feedback record', async () => {
      const feedback = createTestFeedbackRecord();

      await repo.insert(feedback);

      const result = await testPool.query('SELECT * FROM feedback_records WHERE id = $1', [
        'feedback_test_1',
      ]);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]!.entry_id).toBe('entry_test_1');
      expect(result.rows[0]!.problem_type).toBe('incorrect');
    });

    it('should insert feedback with custom answers', async () => {
      const feedback = createTestFeedbackRecord({
        customAnswers: [
          { prompt: 'What happened?', answer: 'The code crashed' },
          { prompt: 'Steps to reproduce?', answer: 'Run the test suite' },
        ],
      });

      await repo.insert(feedback);

      const result = await testPool.query(
        'SELECT * FROM feedback_custom_answers WHERE feedback_id = $1',
        ['feedback_test_1'],
      );
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]!.question_key).toBe('What happened?');
      expect(result.rows[1]!.question_key).toBe('Steps to reproduce?');
    });
  });

  describe('getById', () => {
    it('should return null for nonexistent id', async () => {
      const found = await repo.getById('feedback_nonexistent');
      expect(found).toBeNull();
    });

    it('should retrieve a feedback record by id', async () => {
      const feedback = createTestFeedbackRecord();
      await repo.insert(feedback);

      const found = await repo.getById('feedback_test_1');
      expect(found).not.toBeNull();
      expect(found?.id).toBe('feedback_test_1');
      expect(found?.entryId).toBe('entry_test_1');
      expect(found?.problemType).toBe('incorrect');
      expect(found?.status).toBe('new');
    });

    it('should retrieve feedback with custom answers', async () => {
      const feedback = createTestFeedbackRecord({
        customAnswers: [{ prompt: 'What happened?', answer: 'The code crashed' }],
      });
      await repo.insert(feedback);

      const found = await repo.getById('feedback_test_1');
      expect(found?.customAnswers).toHaveLength(1);
      expect(found?.customAnswers?.[0]?.prompt).toBe('What happened?');
    });
  });

  describe('listByEntry', () => {
    it('should return feedback for a specific entry', async () => {
      await repo.insert(createTestFeedbackRecord({ id: 'feedback_test_1', entryId: 'entry_a' }));
      await repo.insert(createTestFeedbackRecord({ id: 'feedback_test_2', entryId: 'entry_b' }));
      await repo.insert(createTestFeedbackRecord({ id: 'feedback_test_3', entryId: 'entry_a' }));

      const results = await repo.listByEntry('entry_a');
      expect(results).toHaveLength(2);
      expect(results.map((f) => f.id).sort()).toEqual(['feedback_test_1', 'feedback_test_3']);
    });
  });

  describe('listByStatus', () => {
    it('should return feedback with a specific status', async () => {
      await repo.insert(createTestFeedbackRecord({ id: 'feedback_test_1', status: 'new' }));
      await repo.insert(createTestFeedbackRecord({ id: 'feedback_test_2', status: 'triaged' }));
      await repo.insert(createTestFeedbackRecord({ id: 'feedback_test_3', status: 'new' }));

      const results = await repo.listByStatus('new');
      expect(results).toHaveLength(2);
      expect(results.map((f) => f.id).sort()).toEqual(['feedback_test_1', 'feedback_test_3']);
    });
  });

  describe('listByFilter', () => {
    it('should filter by status array', async () => {
      await repo.insert(createTestFeedbackRecord({ id: 'feedback_test_1', status: 'new' }));
      await repo.insert(createTestFeedbackRecord({ id: 'feedback_test_2', status: 'triaged' }));
      await repo.insert(createTestFeedbackRecord({ id: 'feedback_test_3', status: 'resolved' }));

      const results = await repo.listByFilter({ status: ['new', 'triaged'] });
      expect(results).toHaveLength(2);
    });

    it('should filter by problemType', async () => {
      await repo.insert(
        createTestFeedbackRecord({ id: 'feedback_test_1', problemType: 'incorrect' }),
      );
      await repo.insert(
        createTestFeedbackRecord({ id: 'feedback_test_2', problemType: 'outdated' }),
      );

      const results = await repo.listByFilter({ problemType: ['incorrect'] });
      expect(results).toHaveLength(1);
      expect(results[0]!.id).toBe('feedback_test_1');
    });

    it('should filter by entryId and entryType', async () => {
      await repo.insert(
        createTestFeedbackRecord({
          id: 'feedback_test_1',
          entryId: 'entry_1',
          entryType: 'trap',
        }),
      );
      await repo.insert(
        createTestFeedbackRecord({
          id: 'feedback_test_2',
          entryId: 'entry_1',
          entryType: 'skill',
        }),
      );
      await repo.insert(
        createTestFeedbackRecord({
          id: 'feedback_test_3',
          entryId: 'entry_2',
          entryType: 'trap',
        }),
      );

      const results = await repo.listByFilter({ entryId: 'entry_1', entryType: 'trap' });
      expect(results).toHaveLength(1);
      expect(results[0]!.id).toBe('feedback_test_1');
    });

    it('should return all records when no filters applied', async () => {
      await repo.insert(createTestFeedbackRecord({ id: 'feedback_test_1' }));
      await repo.insert(createTestFeedbackRecord({ id: 'feedback_test_2' }));

      const results = await repo.listByFilter({});
      expect(results.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('update', () => {
    it('should update feedback status and adminNotes', async () => {
      await repo.insert(createTestFeedbackRecord());

      await repo.update('feedback_test_1', {
        status: 'triaged',
        adminNotes: 'Looking into this',
      });

      const found = await repo.getById('feedback_test_1');
      expect(found?.status).toBe('triaged');
      expect(found?.adminNotes).toBe('Looking into this');
    });

    it('should update resolvedAt and resolvedByUserId', async () => {
      await repo.insert(createTestFeedbackRecord());

      const resolvedAt = new Date().toISOString();
      await repo.update('feedback_test_1', {
        status: 'resolved',
        resolvedAt,
        resolvedByUserId: 'admin_1',
      });

      const found = await repo.getById('feedback_test_1');
      expect(found?.status).toBe('resolved');
      expect(found?.resolvedByUserId).toBe('admin_1');
    });

    it('should update updatedAt timestamp', async () => {
      const feedback = createTestFeedbackRecord();
      await repo.insert(feedback);

      const originalUpdatedAt = feedback.updatedAt;

      // Small delay to ensure timestamp changes
      await new Promise((resolve) => setTimeout(resolve, 10));

      await repo.update('feedback_test_1', { status: 'triaged' });

      const found = await repo.getById('feedback_test_1');
      expect(found?.updatedAt).not.toBe(originalUpdatedAt);
    });
  });

  describe('CHECK constraints', () => {
    it('should reject invalid entryType', async () => {
      const feedback = createTestFeedbackRecord({ entryType: 'invalid' as 'trap' });

      await expect(repo.insert(feedback)).rejects.toThrow();
    });

    it('should reject invalid problemType', async () => {
      const feedback = createTestFeedbackRecord({ problemType: 'invalid' as 'incorrect' });

      await expect(repo.insert(feedback)).rejects.toThrow();
    });

    it('should reject invalid status', async () => {
      const feedback = createTestFeedbackRecord({ status: 'invalid' as 'new' });

      await expect(repo.insert(feedback)).rejects.toThrow();
    });
  });
});
