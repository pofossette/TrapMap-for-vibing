import { describe, expect, it } from 'vitest';
import { adminBoundarySearchMatchSchema } from './admin.js';

describe('admin schema contracts', () => {
  describe('adminBoundarySearchMatchSchema', () => {
    const baseMatch = {
      entryId: 'entry-1',
      scope: 'global' as const,
      labels: ['test'],
      boundary: null,
    };

    it('accepts valid match with non-empty shortcut and detail', () => {
      const match = adminBoundarySearchMatchSchema.parse({
        ...baseMatch,
        shortcut: 'Fix login bug',
        detail: 'Detailed description of the fix',
      });
      expect(match.shortcut).toBe('Fix login bug');
      expect(match.detail).toBe('Detailed description of the fix');
    });

    it('rejects empty shortcut', () => {
      expect(() =>
        adminBoundarySearchMatchSchema.parse({
          ...baseMatch,
          shortcut: '',
          detail: 'Some detail',
        }),
      ).toThrow();
    });

    it('rejects empty detail', () => {
      expect(() =>
        adminBoundarySearchMatchSchema.parse({
          ...baseMatch,
          shortcut: 'Some shortcut',
          detail: '',
        }),
      ).toThrow();
    });
  });
});
