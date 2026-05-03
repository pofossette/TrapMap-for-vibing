import { describe, expect, it } from 'vitest';

import { candidates } from '../schema.js';

describe('candidates table schema', () => {
  it('exports a candidates pgTable with all required columns', () => {
    expect(candidates).toBeDefined();
    expect(typeof candidates).toBe('object');

    // Verify all 17 columns are defined (16 specified + id)
    const columnNames = Object.keys(candidates);
    expect(columnNames).toContain('id');
    expect(columnNames).toContain('sourceType');
    expect(columnNames).toContain('submittedBy');
    expect(columnNames).toContain('teamId');
    expect(columnNames).toContain('status');
    expect(columnNames).toContain('originalPayload');
    expect(columnNames).toContain('analysisSnapshot');
    expect(columnNames).toContain('duplicateCase');
    expect(columnNames).toContain('receivedAt');
    expect(columnNames).toContain('queuedAt');
    expect(columnNames).toContain('analyzingAt');
    expect(columnNames).toContain('completedAt');
    expect(columnNames).toContain('lastError');
    expect(columnNames).toContain('retryCount');
    expect(columnNames).toContain('manualResult');
    expect(columnNames).toContain('createdAt');
    expect(columnNames).toContain('updatedAt');
  });

  it('has id as primary key', () => {
    expect(candidates.id.primary).toBe(true);
  });

  it('uses snake_case column names for PostgreSQL compatibility', () => {
    // Drizzle stores the actual column name in the column object
    // These are the PostgreSQL column names (snake_case)
    expect(candidates.sourceType.name).toBe('source_type');
    expect(candidates.submittedBy.name).toBe('submitted_by');
    expect(candidates.teamId.name).toBe('team_id');
    expect(candidates.analysisSnapshot.name).toBe('analysis_snapshot');
    expect(candidates.duplicateCase.name).toBe('duplicate_case');
    expect(candidates.receivedAt.name).toBe('received_at');
    expect(candidates.queuedAt.name).toBe('queued_at');
    expect(candidates.analyzingAt.name).toBe('analyzing_at');
    expect(candidates.completedAt.name).toBe('completed_at');
    expect(candidates.lastError.name).toBe('last_error');
    expect(candidates.retryCount.name).toBe('retry_count');
    expect(candidates.manualResult.name).toBe('manual_result');
    expect(candidates.createdAt.name).toBe('created_at');
    expect(candidates.updatedAt.name).toBe('updated_at');
  });
});
