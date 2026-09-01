import { describe, expect, it } from 'vitest';
import { accessKeySchema } from '../../src/domain/team.js';

describe('team schema contracts', () => {
  describe('accessKeySchema', () => {
    const baseKey = {
      id: 'key-1',
      memberId: 'member-1',
      tokenPreview: 'tok_abc123',
      issuedBy: { id: 'user-1', handle: 'admin', securityLevel: 8 },
      teamId: 'team-1',
      level: 5,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };

    it('accepts null revokedAt', () => {
      const key = accessKeySchema.parse(baseKey);
      expect(key.revokedAt).toBeNull();
    });

    it('accepts valid ISO timestamp for revokedAt', () => {
      const key = accessKeySchema.parse({
        ...baseKey,
        revokedAt: '2024-06-15T12:00:00Z',
      });
      expect(key.revokedAt).toBe('2024-06-15T12:00:00Z');
    });

    it('rejects non-ISO timestamp for revokedAt', () => {
      expect(() =>
        accessKeySchema.parse({
          ...baseKey,
          revokedAt: 'not-a-timestamp',
        }),
      ).toThrow();
    });

    it('rejects plain date string for revokedAt', () => {
      expect(() =>
        accessKeySchema.parse({
          ...baseKey,
          revokedAt: '2024-06-15',
        }),
      ).toThrow();
    });
  });
});
