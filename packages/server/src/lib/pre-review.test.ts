import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Boundary } from '@trapmap/contracts';

import type { ChatProvider } from '@trapmap/ai-providers';
import type { BoundaryWithQuality } from './boundary-extract.js';
import { runPreReview } from './pre-review.js';

// ---------------------------------------------------------------------------
// Mock boundary-extract module
// ---------------------------------------------------------------------------

vi.mock('./boundary-extract.js', () => ({
  extractCandidateBoundaries: vi.fn(),
  extractCandidateBoundariesWithQuality: vi.fn(),
}));

import {
  extractCandidateBoundaries,
  extractCandidateBoundariesWithQuality,
} from './boundary-extract.js';

const mockExtractCandidateBoundaries = vi.mocked(extractCandidateBoundaries);
const mockExtractCandidateBoundariesWithQuality = vi.mocked(extractCandidateBoundariesWithQuality);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockChat(configured = true): ChatProvider {
  return {
    provider: 'mock',
    isConfigured: configured,
    invoke: vi.fn().mockResolvedValue('{}'),
  };
}

function makeQualityResponse(overrides?: Partial<BoundaryWithQuality>): BoundaryWithQuality {
  return {
    boundary: {
      context: [],
      versions: [],
      prerequisites: [],
      signals: [],
      exclusions: [],
      evidence: [],
    },
    correctness: {
      evidenceQuality: 'strong',
      reasoning: 'Well-supported with specific issue reference.',
    },
    completeness: {
      isComplete: true,
      missingAspects: [],
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runPreReview', () => {
  beforeEach(() => {
    mockExtractCandidateBoundariesWithQuality.mockReset();
    mockExtractCandidateBoundaries.mockReset();
  });

  describe('without LLM (chat not configured)', () => {
    it('uses keyword-based correctness risk', async () => {
      const result = await runPreReview({
        existingEntries: [],
        submission: {
          shortcut: 'Test',
          detail: 'Short detail',
          labels: ['test'],
          scope: 'team',
        },
      });

      // Short detail, no evidence terms → high correctness risk
      expect(result.correctnessRisk).toBe('high');
      expect(result.completenessRisk).toBe('high');
    });

    it('low correctness risk when multiple evidence terms present', async () => {
      const result = await runPreReview({
        existingEntries: [],
        submission: {
          shortcut: 'Test',
          detail:
            'This fix works because of the root cause analysis. We verified the solution by running tests. The caused by field shows the issue.',
          labels: ['test', 'fix'],
          scope: 'team',
        },
      });

      expect(result.correctnessRisk).toBe('low');
    });

    it('preserves existing keyword-based completeness heuristics', async () => {
      const result = await runPreReview({
        existingEntries: [],
        submission: {
          shortcut: 'Test',
          detail: 'A'.repeat(200),
          labels: ['test', 'fix'],
          scope: 'team',
        },
      });

      expect(result.completenessRisk).toBe('low');
    });
  });

  describe('with LLM configured', () => {
    it('calls extractCandidateBoundariesWithQuality when chat is configured', async () => {
      mockExtractCandidateBoundariesWithQuality.mockResolvedValueOnce(makeQualityResponse());

      await runPreReview({
        existingEntries: [],
        submission: {
          shortcut: 'Docker timeout',
          detail: 'Container health check issue in production.',
          labels: ['docker'],
          scope: 'team',
        },
        chatProvider: mockChat(),
      });

      expect(mockExtractCandidateBoundariesWithQuality).toHaveBeenCalledTimes(1);
    });

    it('uses LLM evidence quality for correctness risk', async () => {
      mockExtractCandidateBoundariesWithQuality.mockResolvedValueOnce(
        makeQualityResponse({
          correctness: { evidenceQuality: 'strong', reasoning: 'Specific CVE reference.' },
        }),
      );

      const result = await runPreReview({
        existingEntries: [],
        submission: {
          shortcut: 'CVE fix',
          detail: 'Critical vulnerability fix.',
          labels: ['security'],
          scope: 'team',
        },
        chatProvider: mockChat(),
      });

      // strong evidence → low risk
      expect(result.correctnessRisk).toBe('low');
    });

    it('maps weak evidence quality to medium-high correctness risk', async () => {
      mockExtractCandidateBoundariesWithQuality.mockResolvedValueOnce(
        makeQualityResponse({
          correctness: { evidenceQuality: 'weak', reasoning: 'Vague claims without specifics.' },
        }),
      );

      const result = await runPreReview({
        existingEntries: [],
        submission: {
          shortcut: 'Test',
          detail: 'Some issue exists.',
          labels: ['test'],
          scope: 'team',
        },
        chatProvider: mockChat(),
      });

      // weak evidence → 0.7 → medium (just below 0.72 threshold)
      expect(result.correctnessRisk).toBe('medium');
    });

    it('maps none evidence quality to high correctness risk', async () => {
      mockExtractCandidateBoundariesWithQuality.mockResolvedValueOnce(
        makeQualityResponse({
          correctness: { evidenceQuality: 'none', reasoning: 'No evidence at all.' },
        }),
      );

      const result = await runPreReview({
        existingEntries: [],
        submission: {
          shortcut: 'Test',
          detail: 'Just trust me.',
          labels: ['test'],
          scope: 'team',
        },
        chatProvider: mockChat(),
      });

      expect(result.correctnessRisk).toBe('high');
    });

    it('uses LLM completeness assessment', async () => {
      mockExtractCandidateBoundariesWithQuality.mockResolvedValueOnce(
        makeQualityResponse({
          completeness: {
            isComplete: false,
            missingAspects: [
              'root cause explanation',
              'reproduction steps',
              'version requirements',
            ],
          },
        }),
      );

      const result = await runPreReview({
        existingEntries: [],
        submission: {
          shortcut: 'Test',
          detail: 'Incomplete entry.',
          labels: ['test'],
          scope: 'team',
        },
        chatProvider: mockChat(),
      });

      // 3+ missing aspects → high completeness risk
      expect(result.completenessRisk).toBe('high');
    });

    it('medium completeness risk with 1-2 missing aspects', async () => {
      mockExtractCandidateBoundariesWithQuality.mockResolvedValueOnce(
        makeQualityResponse({
          completeness: {
            isComplete: false,
            missingAspects: ['reproduction steps'],
          },
        }),
      );

      const result = await runPreReview({
        existingEntries: [],
        submission: {
          shortcut: 'Test',
          detail: 'Almost complete entry.',
          labels: ['test'],
          scope: 'team',
        },
        chatProvider: mockChat(),
      });

      expect(result.completenessRisk).toBe('medium');
    });

    it('low completeness risk when isComplete is true', async () => {
      mockExtractCandidateBoundariesWithQuality.mockResolvedValueOnce(
        makeQualityResponse({
          completeness: { isComplete: true, missingAspects: [] },
        }),
      );

      const result = await runPreReview({
        existingEntries: [],
        submission: {
          shortcut: 'Test',
          detail: 'Complete entry with good detail.',
          labels: ['test'],
          scope: 'team',
        },
        chatProvider: mockChat(),
      });

      expect(result.completenessRisk).toBe('low');
    });

    it('extracts boundary from quality result', async () => {
      const boundary: Boundary = {
        context: ['frontend', 'production'],
        versions: [{ package: 'react', range: '>=18.0.0' }],
        prerequisites: [],
        signals: [],
        exclusions: [],
        evidence: [],
      };
      mockExtractCandidateBoundariesWithQuality.mockResolvedValueOnce(
        makeQualityResponse({ boundary }),
      );

      const result = await runPreReview({
        existingEntries: [],
        submission: {
          shortcut: 'React 18 issue',
          detail: 'Breaking change in React 18.',
          labels: ['react'],
          scope: 'team',
        },
        chatProvider: mockChat(),
      });

      expect(result.boundary).not.toBeNull();
      expect(result.boundary?.context).toEqual(['frontend', 'production']);
      expect(result.boundary?.versions).toHaveLength(1);
    });

    it('includes quality assessment notes', async () => {
      mockExtractCandidateBoundariesWithQuality.mockResolvedValueOnce(
        makeQualityResponse({
          correctness: { evidenceQuality: 'weak', reasoning: 'No specific references.' },
          completeness: { isComplete: false, missingAspects: ['root cause', 'repro steps'] },
        }),
      );

      const result = await runPreReview({
        existingEntries: [],
        submission: {
          shortcut: 'Test',
          detail: 'Test detail.',
          labels: ['test'],
          scope: 'team',
        },
        chatProvider: mockChat(),
      });

      expect(result.notes).toEqual(
        expect.arrayContaining([
          expect.stringContaining('quality assessment'),
          expect.stringContaining('Evidence quality: weak'),
          expect.stringContaining('Missing aspects:'),
        ]),
      );
    });

    it('rejects when completeness is high even with LLM', async () => {
      mockExtractCandidateBoundariesWithQuality.mockResolvedValueOnce(
        makeQualityResponse({
          completeness: {
            isComplete: false,
            missingAspects: ['root cause', 'reproduction steps', 'platform notes'],
          },
        }),
      );

      const result = await runPreReview({
        existingEntries: [],
        submission: {
          shortcut: 'Test',
          detail: 'Incomplete.',
          labels: ['test'],
          scope: 'team',
        },
        chatProvider: mockChat(),
      });

      expect(result.status).toBe('agent-rejected');
    });
  });

  describe('LLM fallback behavior', () => {
    it('falls back to legacy extractCandidateBoundaries when quality extraction returns null', async () => {
      mockExtractCandidateBoundariesWithQuality.mockResolvedValueOnce(null);
      const fallbackBoundary: Boundary = {
        context: ['backend'],
        versions: [],
        prerequisites: [],
        signals: [],
        exclusions: [],
        evidence: [],
      };
      mockExtractCandidateBoundaries.mockResolvedValueOnce(fallbackBoundary);

      const result = await runPreReview({
        existingEntries: [],
        submission: {
          shortcut: 'Test',
          detail: 'A'.repeat(200),
          labels: ['test', 'fix'],
          scope: 'team',
        },
        chatProvider: mockChat(),
      });

      expect(mockExtractCandidateBoundaries).toHaveBeenCalledTimes(1);
      expect(result.boundary?.context).toEqual(['backend']);
      expect(result.notes).toEqual(
        expect.arrayContaining([expect.stringContaining('legacy mode')]),
      );
    });

    it('uses keyword-based risks when both extraction methods fail', async () => {
      mockExtractCandidateBoundariesWithQuality.mockResolvedValueOnce(null);
      mockExtractCandidateBoundaries.mockResolvedValueOnce(null);

      const result = await runPreReview({
        existingEntries: [],
        submission: {
          shortcut: 'Test',
          detail: 'Short.',
          labels: [],
          scope: 'team',
        },
        chatProvider: mockChat(),
      });

      // Short detail, no labels → keyword-based high risk
      expect(result.completenessRisk).toBe('high');
      expect(result.correctnessRisk).toBe('high');
      expect(result.boundary).toBeNull();
    });
  });

  describe('duplicate detection', () => {
    it('high duplicate risk for overlapping content', async () => {
      const result = await runPreReview({
        existingEntries: [
          {
            id: 'existing-1',
            teamId: null,
            scope: 'team',
            labels: ['test'],
            shortcut: 'Docker timeout fix',
            detail: 'Increase health check interval to 30s',
            requiredLevel: 0,
            lifecycleState: 'active',
            ownerUserId: 'user-1',
            latestRevision: {} as never,
            history: [],
            metadata: {} as never,
            latestSubmissionId: null,
            submissionHistory: [],
            agentReview: null,
            reviewHistory: [],
            reviewNotes: [],
            lifecycleHistory: [],
            embeddingCache: null,
            indexState: null,
            boundary: null,
            decayMeta: null,
            evidenceMeta: null,
            maintenanceMeta: null,
          },
        ],
        submission: {
          shortcut: 'Docker timeout fix',
          detail: 'Increase health check interval to 30s',
          labels: ['docker'],
          scope: 'team',
        },
      });

      expect(result.duplicateRisk).toBe('high');
    });
  });

  describe('author boundary handling', () => {
    it('uses provided author boundary without LLM call', async () => {
      const authorBoundary: Boundary = {
        context: ['custom'],
        versions: [],
        prerequisites: [],
        signals: [],
        exclusions: [],
        evidence: [],
      };

      const result = await runPreReview({
        existingEntries: [],
        submission: {
          shortcut: 'Test',
          detail: 'Test detail.',
          labels: ['test'],
          scope: 'team',
        },
        chatProvider: mockChat(),
        authorBoundary,
      });

      expect(mockExtractCandidateBoundariesWithQuality).not.toHaveBeenCalled();
      expect(result.boundary?.context).toEqual(['custom']);
    });
  });
});
