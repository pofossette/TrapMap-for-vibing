import { describe, expect, it } from 'vitest';

import { conflictHintSchema, conflictRelationSchema, conflictTypeSchema } from './conflict.js';

describe('conflict schema', () => {
  describe('conflictTypeSchema', () => {
    it('accepts "alternative" type', () => {
      expect(conflictTypeSchema.parse('alternative')).toBe('alternative');
    });

    it('accepts "contradictory" type', () => {
      expect(conflictTypeSchema.parse('contradictory')).toBe('contradictory');
    });

    it('accepts "superseded" type', () => {
      expect(conflictTypeSchema.parse('superseded')).toBe('superseded');
    });

    it('rejects invalid conflict type strings', () => {
      expect(() => conflictTypeSchema.parse('invalid-type')).toThrow();
      expect(() => conflictTypeSchema.parse('')).toThrow();
    });
  });

  describe('conflictRelationSchema', () => {
    const validRecord = {
      id: 'conflict-123',
      entryIdA: 'entry-1',
      entryIdB: 'entry-2',
      conflictType: 'alternative' as const,
      context: 'Different approaches to the same problem',
      problemOverlapScore: 0.75,
      solutionDiffScore: 0.5,
      detectedAt: '2026-05-02T10:00:00Z',
    };

    it('accepts valid record with all required fields', () => {
      const result = conflictRelationSchema.parse(validRecord);
      expect(result.id).toBe('conflict-123');
      expect(result.entryIdA).toBe('entry-1');
      expect(result.entryIdB).toBe('entry-2');
      expect(result.conflictType).toBe('alternative');
      expect(result.context).toBe('Different approaches to the same problem');
      expect(result.problemOverlapScore).toBe(0.75);
      expect(result.solutionDiffScore).toBe(0.5);
      expect(result.detectedAt).toBe('2026-05-02T10:00:00Z');
    });

    it('rejects record with missing id', () => {
      const { id, ...missingId } = validRecord;
      expect(() => conflictRelationSchema.parse(missingId)).toThrow();
    });

    it('rejects record with missing entryIdA', () => {
      const { entryIdA, ...missingEntryIdA } = validRecord;
      expect(() => conflictRelationSchema.parse(missingEntryIdA)).toThrow();
    });

    it('rejects record with missing entryIdB', () => {
      const { entryIdB, ...missingEntryIdB } = validRecord;
      expect(() => conflictRelationSchema.parse(missingEntryIdB)).toThrow();
    });

    it('rejects record with missing conflictType', () => {
      const { conflictType, ...missingConflictType } = validRecord;
      expect(() => conflictRelationSchema.parse(missingConflictType)).toThrow();
    });

    it('rejects record with missing context', () => {
      const { context, ...missingContext } = validRecord;
      expect(() => conflictRelationSchema.parse(missingContext)).toThrow();
    });

    it('rejects record with missing detectedAt', () => {
      const { detectedAt, ...missingDetectedAt } = validRecord;
      expect(() => conflictRelationSchema.parse(missingDetectedAt)).toThrow();
    });

    it('validates problemOverlapScore is between 0 and 1', () => {
      expect(() =>
        conflictRelationSchema.parse({ ...validRecord, problemOverlapScore: -0.1 }),
      ).toThrow();
      expect(() =>
        conflictRelationSchema.parse({ ...validRecord, problemOverlapScore: 1.1 }),
      ).toThrow();
    });

    it('validates solutionDiffScore is between 0 and 1', () => {
      expect(() =>
        conflictRelationSchema.parse({ ...validRecord, solutionDiffScore: -0.1 }),
      ).toThrow();
      expect(() =>
        conflictRelationSchema.parse({ ...validRecord, solutionDiffScore: 1.1 }),
      ).toThrow();
    });

    it('validates context max length 500', () => {
      const longContext = 'a'.repeat(501);
      expect(() =>
        conflictRelationSchema.parse({ ...validRecord, context: longContext }),
      ).toThrow();
    });
  });

  describe('conflictHintSchema', () => {
    const validHint = {
      entryId: 'entry-456',
      shortcut: 'Use GraphQL for APIs',
      conflictType: 'alternative' as const,
      context: 'Different approaches: "Use GraphQL" vs "Use REST"',
    };

    it('accepts valid hint with all fields', () => {
      const result = conflictHintSchema.parse(validHint);
      expect(result.entryId).toBe('entry-456');
      expect(result.shortcut).toBe('Use GraphQL for APIs');
      expect(result.conflictType).toBe('alternative');
      expect(result.context).toBe('Different approaches: "Use GraphQL" vs "Use REST"');
    });

    it('compact form excludes scores', () => {
      const result = conflictHintSchema.parse(validHint);
      expect(result).not.toHaveProperty('problemOverlapScore');
      expect(result).not.toHaveProperty('solutionDiffScore');
    });

    it('rejects hint with missing entryId', () => {
      const { entryId, ...missingEntryId } = validHint;
      expect(() => conflictHintSchema.parse(missingEntryId)).toThrow();
    });

    it('rejects hint with missing shortcut', () => {
      const { shortcut, ...missingShortcut } = validHint;
      expect(() => conflictHintSchema.parse(missingShortcut)).toThrow();
    });

    it('rejects hint with missing conflictType', () => {
      const { conflictType, ...missingConflictType } = validHint;
      expect(() => conflictHintSchema.parse(missingConflictType)).toThrow();
    });

    it('rejects hint with missing context', () => {
      const { context, ...missingContext } = validHint;
      expect(() => conflictHintSchema.parse(missingContext)).toThrow();
    });
  });

  describe('conflictRelationSchema entryId ordering', () => {
    const makeRelation = () => ({
      id: 'conflict-123',
      entryIdA: 'entry-b',
      entryIdB: 'entry-c',
      conflictType: 'alternative' as const,
      context: 'Different approaches',
      problemOverlapScore: 0.5,
      solutionDiffScore: 0.5,
      detectedAt: '2026-05-02T10:00:00Z',
    });

    it('rejects entryIdA === entryIdB', () => {
      expect(() =>
        conflictRelationSchema.parse({
          ...makeRelation(),
          entryIdA: 'entry-1',
          entryIdB: 'entry-1',
        }),
      ).toThrow();
    });

    it('rejects entryIdA > entryIdB (not canonically ordered)', () => {
      expect(() =>
        conflictRelationSchema.parse({
          ...makeRelation(),
          entryIdA: 'zzz-entry',
          entryIdB: 'aaa-entry',
        }),
      ).toThrow();
    });
  });
});
