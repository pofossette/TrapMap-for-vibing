import { describe, expect, it } from 'vitest';
import { auditMetadataSchema } from '../../src/domain/common.js';

describe('common schema contracts', () => {
  describe('auditMetadataSchema', () => {
    it('accepts valid audit metadata', () => {
      const meta = auditMetadataSchema.parse({
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-06-15T12:00:00Z',
      });
      expect(meta.createdAt).toBe('2024-01-01T00:00:00Z');
      expect(meta.updatedAt).toBe('2024-06-15T12:00:00Z');
    });

    it('rejects extra fields (strict mode)', () => {
      expect(() =>
        auditMetadataSchema.parse({
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-06-15T12:00:00Z',
          extra: 'not allowed',
        }),
      ).toThrow();
    });

    it('requires both createdAt and updatedAt', () => {
      expect(() =>
        auditMetadataSchema.parse({
          createdAt: '2024-01-01T00:00:00Z',
        }),
      ).toThrow();
    });
  });
});
