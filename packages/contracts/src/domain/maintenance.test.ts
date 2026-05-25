import { describe, expect, it } from 'vitest';
import {
  maintenanceBatchOperationItemSchema,
  maintenanceBatchOperationResponseSchema,
} from './maintenance.js';

const validActorRef = {
  id: 'user-1',
  handle: 'testuser',
  securityLevel: 5,
};

describe('maintenance schema contracts', () => {
  describe('maintenanceBatchOperationItemSchema', () => {
    const baseItem = {
      entryId: 'entry-1',
      shortcut: 'Fix login',
      currentMaintainer: validActorRef,
      currentReviewBy: '2024-06-01T00:00:00Z',
      proposedChange: 'Assign new owner',
    };

    it('accepts eligible item with null ineligibilityReason', () => {
      const item = maintenanceBatchOperationItemSchema.parse({
        ...baseItem,
        eligible: true,
        ineligibilityReason: null,
      });
      expect(item.eligible).toBe(true);
      expect(item.ineligibilityReason).toBeNull();
    });

    it('accepts ineligible item with reason', () => {
      const item = maintenanceBatchOperationItemSchema.parse({
        ...baseItem,
        eligible: false,
        ineligibilityReason: 'Entry is deactivated',
      });
      expect(item.eligible).toBe(false);
      expect(item.ineligibilityReason).toBe('Entry is deactivated');
    });

    it('rejects eligible=true with non-null ineligibilityReason', () => {
      expect(() =>
        maintenanceBatchOperationItemSchema.parse({
          ...baseItem,
          eligible: true,
          ineligibilityReason: 'Some reason',
        }),
      ).toThrow();
    });
  });

  describe('maintenanceBatchOperationResponseSchema', () => {
    const baseResponse = {
      action: 'assign-owner' as const,
      dryRun: false,
      items: [
        {
          entryId: 'entry-1',
          shortcut: 'Fix login',
          currentMaintainer: null,
          currentReviewBy: null,
          proposedChange: 'Assign owner',
          eligible: true,
          ineligibilityReason: null,
        },
      ],
      totalEligible: 1,
      totalIneligible: 0,
      appliedAt: '2024-01-01T00:00:00Z',
    };

    it('accepts valid response with applied timestamp', () => {
      const response = maintenanceBatchOperationResponseSchema.parse(baseResponse);
      expect(response.action).toBe('assign-owner');
      expect(response.appliedAt).toBe('2024-01-01T00:00:00Z');
    });

    it('accepts dry-run response with null appliedAt', () => {
      const response = maintenanceBatchOperationResponseSchema.parse({
        ...baseResponse,
        dryRun: true,
        appliedAt: null,
      });
      expect(response.dryRun).toBe(true);
      expect(response.appliedAt).toBeNull();
    });

    it('rejects dryRun=true with non-null appliedAt', () => {
      expect(() =>
        maintenanceBatchOperationResponseSchema.parse({
          ...baseResponse,
          dryRun: true,
          appliedAt: '2024-01-01T00:00:00Z',
        }),
      ).toThrow();
    });

    it('rejects when totalEligible + totalIneligible !== items.length', () => {
      expect(() =>
        maintenanceBatchOperationResponseSchema.parse({
          ...baseResponse,
          totalEligible: 2,
          totalIneligible: 0,
          // items.length is 1, not 2
        }),
      ).toThrow();
    });

    it('accepts when totalEligible + totalIneligible equals items.length', () => {
      const response = maintenanceBatchOperationResponseSchema.parse({
        ...baseResponse,
        items: [
          {
            entryId: 'entry-1',
            shortcut: 'A',
            currentMaintainer: null,
            currentReviewBy: null,
            proposedChange: 'Change A',
            eligible: true,
            ineligibilityReason: null,
          },
          {
            entryId: 'entry-2',
            shortcut: 'B',
            currentMaintainer: null,
            currentReviewBy: null,
            proposedChange: 'Change B',
            eligible: false,
            ineligibilityReason: 'Locked',
          },
        ],
        totalEligible: 1,
        totalIneligible: 1,
      });
      expect(response.totalEligible).toBe(1);
      expect(response.totalIneligible).toBe(1);
    });
  });
});
