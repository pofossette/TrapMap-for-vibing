import { describe, expect, it } from 'vitest';
import {
  batchOperationItemSchema,
  batchOperationResponseSchema,
  freshnessDecayConfigSchema,
} from '../../src/domain/decay.js';

describe('decay schema contracts', () => {
  describe('batchOperationItemSchema', () => {
    const baseItem = {
      entryId: 'entry-1',
      shortcut: 'Fix timeout',
      currentDecayState: 'active' as const,
      proposedDecayState: 'review-due' as const,
      changeDescription: 'Mark for review',
    };

    it('accepts eligible item with null ineligibilityReason', () => {
      const item = batchOperationItemSchema.parse({
        ...baseItem,
        eligible: true,
        ineligibilityReason: null,
      });
      expect(item.eligible).toBe(true);
      expect(item.ineligibilityReason).toBeNull();
    });

    it('accepts ineligible item with reason', () => {
      const item = batchOperationItemSchema.parse({
        ...baseItem,
        eligible: false,
        ineligibilityReason: 'Entry is expired',
      });
      expect(item.eligible).toBe(false);
      expect(item.ineligibilityReason).toBe('Entry is expired');
    });

    it('rejects eligible=true with non-null ineligibilityReason', () => {
      expect(() =>
        batchOperationItemSchema.parse({
          ...baseItem,
          eligible: true,
          ineligibilityReason: 'Some reason',
        }),
      ).toThrow();
    });
  });

  describe('batchOperationResponseSchema', () => {
    const baseResponse = {
      action: 'extend' as const,
      dryRun: false,
      items: [
        {
          entryId: 'entry-1',
          shortcut: 'Fix timeout',
          currentDecayState: 'stale' as const,
          proposedDecayState: 'active' as const,
          changeDescription: 'Extend verification',
          eligible: true,
          ineligibilityReason: null,
        },
      ],
      totalEligible: 1,
      totalIneligible: 0,
      appliedAt: '2024-01-01T00:00:00Z',
    };

    it('accepts valid response with applied timestamp', () => {
      const response = batchOperationResponseSchema.parse(baseResponse);
      expect(response.action).toBe('extend');
      expect(response.appliedAt).toBe('2024-01-01T00:00:00Z');
    });

    it('accepts dry-run response with null appliedAt', () => {
      const response = batchOperationResponseSchema.parse({
        ...baseResponse,
        dryRun: true,
        appliedAt: null,
      });
      expect(response.dryRun).toBe(true);
      expect(response.appliedAt).toBeNull();
    });

    it('rejects dryRun=true with non-null appliedAt', () => {
      expect(() =>
        batchOperationResponseSchema.parse({
          ...baseResponse,
          dryRun: true,
          appliedAt: '2024-01-01T00:00:00Z',
        }),
      ).toThrow();
    });
  });

  describe('freshnessDecayConfigSchema', () => {
    it('requires all sub-objects to be explicitly provided', () => {
      expect(() => freshnessDecayConfigSchema.parse({})).toThrow();
    });

    it('accepts fully specified config', () => {
      const config = freshnessDecayConfigSchema.parse({
        evergreen: { enabled: false },
        versioned: {
          enabled: true,
          mode: 'step',
          matchMultiplier: 1.0,
          mismatchMultiplier: 0.5,
        },
        volatile: {
          enabled: true,
          mode: 'exponential',
          halfLifeDays: 30,
          zeroDays: 90,
          floor: 0.3,
        },
      });
      expect(config.evergreen.enabled).toBe(false);
      expect(config.versioned.mode).toBe('step');
      expect(config.volatile.halfLifeDays).toBe(30);
    });

    it('rejects missing evergreen', () => {
      expect(() =>
        freshnessDecayConfigSchema.parse({
          versioned: { enabled: true, mode: 'step', matchMultiplier: 1.0, mismatchMultiplier: 0.5 },
          volatile: {
            enabled: true,
            mode: 'exponential',
            halfLifeDays: 30,
            zeroDays: 90,
            floor: 0.3,
          },
        }),
      ).toThrow();
    });

    it('rejects missing versioned', () => {
      expect(() =>
        freshnessDecayConfigSchema.parse({
          evergreen: { enabled: false },
          volatile: {
            enabled: true,
            mode: 'exponential',
            halfLifeDays: 30,
            zeroDays: 90,
            floor: 0.3,
          },
        }),
      ).toThrow();
    });

    it('rejects missing volatile', () => {
      expect(() =>
        freshnessDecayConfigSchema.parse({
          evergreen: { enabled: false },
          versioned: { enabled: true, mode: 'step', matchMultiplier: 1.0, mismatchMultiplier: 0.5 },
        }),
      ).toThrow();
    });
  });
});
