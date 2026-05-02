import { describe, expect, it } from 'vitest';

import {
  DEFAULT_EVIDENCE_LEVEL,
  DEFAULT_SOURCE_TYPE,
  createDefaultEvidenceMeta,
  isValidEvidenceLevel,
  isValidSourceType,
  validateEvidence,
} from './model.js';

describe('evidence/model', () => {
  describe('DEFAULT_EVIDENCE_LEVEL', () => {
    it('equals "anecdotal"', () => {
      expect(DEFAULT_EVIDENCE_LEVEL).toBe('anecdotal');
    });
  });

  describe('DEFAULT_SOURCE_TYPE', () => {
    it('equals "internal-experience"', () => {
      expect(DEFAULT_SOURCE_TYPE).toBe('internal-experience');
    });
  });

  describe('createDefaultEvidenceMeta', () => {
    it('returns correct shape with defaults', () => {
      const verifiedAt = '2026-05-02T12:00:00Z';
      const verifiedBy = {
        id: 'user_1',
        handle: 'testuser',
        securityLevel: 5,
      };

      const result = createDefaultEvidenceMeta(verifiedAt, verifiedBy);

      expect(result).toEqual({
        sourceType: 'internal-experience',
        evidenceLevel: 'anecdotal',
        verifiedAt,
        verifiedBy,
      });
    });

    it('uses default sourceType and evidenceLevel', () => {
      const result = createDefaultEvidenceMeta('2026-05-02T12:00:00Z', {
        id: 'user_1',
        handle: 'testuser',
        securityLevel: 5,
      });

      expect(result.sourceType).toBe(DEFAULT_SOURCE_TYPE);
      expect(result.evidenceLevel).toBe(DEFAULT_EVIDENCE_LEVEL);
    });
  });

  describe('validateEvidence', () => {
    it('passes valid complete evidence', () => {
      const evidence = {
        sourceType: 'doc',
        sourceRef: 'https://example.com/docs',
        evidenceLevel: 'documented',
        verifiedAt: '2026-05-02T12:00:00Z',
        verifiedBy: {
          id: 'user_1',
          handle: 'testuser',
          securityLevel: 5,
        },
      };

      const result = validateEvidence(evidence);

      expect(result).toEqual(evidence);
    });

    it('passes evidence without optional sourceRef', () => {
      const evidence = {
        sourceType: 'internal-experience',
        evidenceLevel: 'anecdotal',
        verifiedAt: '2026-05-02T12:00:00Z',
        verifiedBy: {
          id: 'user_1',
          handle: 'testuser',
          securityLevel: 5,
        },
      };

      const result = validateEvidence(evidence);

      expect(result).toEqual(evidence);
      expect(result.sourceRef).toBeUndefined();
    });

    it('throws on invalid evidenceLevel', () => {
      const evidence = {
        sourceType: 'internal-experience',
        evidenceLevel: 'invalid-level',
        verifiedAt: '2026-05-02T12:00:00Z',
        verifiedBy: {
          id: 'user_1',
          handle: 'testuser',
          securityLevel: 5,
        },
      };

      expect(() => validateEvidence(evidence)).toThrow();
    });

    it('throws on invalid sourceType', () => {
      const evidence = {
        sourceType: 'invalid-source',
        evidenceLevel: 'anecdotal',
        verifiedAt: '2026-05-02T12:00:00Z',
        verifiedBy: {
          id: 'user_1',
          handle: 'testuser',
          securityLevel: 5,
        },
      };

      expect(() => validateEvidence(evidence)).toThrow();
    });

    it('throws on missing required fields', () => {
      const evidence = {
        sourceType: 'internal-experience',
        // missing evidenceLevel, verifiedAt, verifiedBy
      };

      expect(() => validateEvidence(evidence)).toThrow();
    });
  });

  describe('isValidEvidenceLevel', () => {
    it('returns true for all 4 valid levels', () => {
      expect(isValidEvidenceLevel('anecdotal')).toBe(true);
      expect(isValidEvidenceLevel('reproduced')).toBe(true);
      expect(isValidEvidenceLevel('documented')).toBe(true);
      expect(isValidEvidenceLevel('verified-in-prod')).toBe(true);
    });

    it('returns false for invalid levels', () => {
      expect(isValidEvidenceLevel('invalid')).toBe(false);
      expect(isValidEvidenceLevel('')).toBe(false);
      expect(isValidEvidenceLevel('ANECDOTAL')).toBe(false); // case-sensitive
      expect(isValidEvidenceLevel('Anecdotal')).toBe(false);
    });
  });

  describe('isValidSourceType', () => {
    it('returns true for all 5 valid types', () => {
      expect(isValidSourceType('internal-experience')).toBe(true);
      expect(isValidSourceType('incident')).toBe(true);
      expect(isValidSourceType('doc')).toBe(true);
      expect(isValidSourceType('code')).toBe(true);
      expect(isValidSourceType('external-reference')).toBe(true);
    });

    it('returns false for invalid types', () => {
      expect(isValidSourceType('invalid')).toBe(false);
      expect(isValidSourceType('')).toBe(false);
      expect(isValidSourceType('DOC')).toBe(false); // case-sensitive
      expect(isValidSourceType('Doc')).toBe(false);
    });
  });
});
