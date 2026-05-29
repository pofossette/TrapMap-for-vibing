import { describe, expect, it } from 'vitest';

import { maintenanceEntryListRequestSchema } from './maintenance.js';
import {
  activationFilePayloadSchema,
  artifactExportResponseSchema,
  bundleFilePayloadSchema,
  bundleScriptDescriptorSchema,
  distilledArtifactSchema,
  importResponseSchema,
  importResultItemSchema,
  knowledgeDeactivateRequestSchema,
  knowledgeListResponseSchema,
  legacyMigrationRequestSchema,
  legacyMigrationResultItemSchema,
  skillReviewDecisionRequestSchema,
  skillReviewQueueResponseSchema,
  statsSummaryQuerySchema,
  statsUsageItemSchema,
  statsUsageResponseSchema,
} from './operations.js';

// Valid actor reference matching actorRefSchema
const validActorRef = {
  id: 'user-1',
  handle: 'testuser',
  securityLevel: 5,
};

const validTimestamp = '2024-01-15T10:30:00.000Z';

// Valid SHA-256 hex hash (64 lowercase hex chars)
const validSha256 = 'a'.repeat(64);

// Valid knowledge entry for schemas that require it
const validKnowledgeEntry = {
  id: 'e1',
  teamId: null,
  scope: 'global' as const,
  labels: ['tag'],
  shortcut: 'test',
  detail: 'test detail',
  requiredLevel: 0,
  lifecycleState: 'approved' as const,
  owner: validActorRef,
  latestRevision: {
    revision: 1,
    submittedAt: validTimestamp,
    submittedBy: validActorRef,
    shortcut: 'test',
    detail: 'test detail',
    labels: ['tag'],
  },
  history: [
    {
      revision: 1,
      submittedAt: validTimestamp,
      submittedBy: validActorRef,
      shortcut: 'test',
      detail: 'test detail',
      labels: ['tag'],
    },
  ],
  metadata: {
    scopeLabel: 'global-constraint' as const,
    submissionCount: 1,
    resubmissionCount: 0,
    revisionCount: 1,
  },
  agentReview: null,
  createdAt: validTimestamp,
  updatedAt: validTimestamp,
};

describe('operations schema fixes', () => {
  // =========================================================================
  // .strict() fixes
  // =========================================================================
  describe('.strict() enforcement', () => {
    describe('knowledgeDeactivateRequestSchema', () => {
      it('accepts valid object with known keys', () => {
        const result = knowledgeDeactivateRequestSchema.parse({
          entryId: 'entry-1',
          reason: 'invalid content',
        });
        expect(result.entryId).toBe('entry-1');
      });

      it('rejects object with extra keys', () => {
        expect(() =>
          knowledgeDeactivateRequestSchema.parse({
            entryId: 'entry-1',
            reason: 'invalid content',
            extra: 'field',
          }),
        ).toThrow();
      });
    });

    describe('legacyMigrationRequestSchema', () => {
      it('accepts valid object with known keys', () => {
        const result = legacyMigrationRequestSchema.parse({
          mode: 'all-approved',
          limit: 50,
        });
        expect(result.mode).toBe('all-approved');
      });

      it('rejects object with extra keys', () => {
        expect(() =>
          legacyMigrationRequestSchema.parse({
            mode: 'all-approved',
            limit: 50,
            extra: 'field',
          }),
        ).toThrow();
      });
    });

    describe('legacyMigrationResultItemSchema', () => {
      it('accepts valid object with known keys', () => {
        const result = legacyMigrationResultItemSchema.parse({
          entryId: 'entry-1',
          artifactId: null,
          success: true,
          skipReason: null,
          error: null,
        });
        expect(result.success).toBe(true);
      });

      it('rejects object with extra keys', () => {
        expect(() =>
          legacyMigrationResultItemSchema.parse({
            entryId: 'entry-1',
            artifactId: null,
            success: true,
            skipReason: null,
            error: null,
            extra: 'field',
          }),
        ).toThrow();
      });
    });

    describe('activationFilePayloadSchema', () => {
      const validPayload = {
        path: 'assets/icon.png',
        kind: 'asset' as const,
        sha256: 'a'.repeat(64),
        sizeBytes: 1024,
        mediaType: 'image/png',
        source: 'assets/' as const,
        content: 'aGVsbG8=', // base64 for "hello"
      };

      it('accepts valid object with known keys', () => {
        const result = activationFilePayloadSchema.parse(validPayload);
        expect(result.path).toBe('assets/icon.png');
      });

      it('rejects object with extra keys', () => {
        expect(() =>
          activationFilePayloadSchema.parse({
            ...validPayload,
            extra: 'field',
          }),
        ).toThrow();
      });
    });

    describe('statsUsageResponseSchema', () => {
      it('accepts valid object with known keys', () => {
        const result = statsUsageResponseSchema.parse({
          items: [{ period: '2024-01', count: 10 }],
        });
        expect(result.items).toHaveLength(1);
      });

      it('rejects object with extra keys', () => {
        expect(() =>
          statsUsageResponseSchema.parse({
            items: [{ period: '2024-01', count: 10 }],
            extra: 'field',
          }),
        ).toThrow();
      });
    });
  });

  // =========================================================================
  // Relationship constraints
  // =========================================================================
  describe('relationship constraints', () => {
    describe('importResponseSchema', () => {
      const makeResult = (success: boolean) => ({
        success,
        entry: success ? validKnowledgeEntry : null,
        error: success ? null : 'some error',
        source: 'json' as const,
      });

      it('accepts when counts match results', () => {
        const result = importResponseSchema.parse({
          results: [makeResult(true), makeResult(false), makeResult(true)],
          importedCount: 2,
          failedCount: 1,
        });
        expect(result.importedCount).toBe(2);
      });

      it('rejects when importedCount does not match successful results', () => {
        expect(() =>
          importResponseSchema.parse({
            results: [makeResult(true), makeResult(false)],
            importedCount: 5,
            failedCount: 1,
          }),
        ).toThrow();
      });

      it('rejects when failedCount does not match failed results', () => {
        expect(() =>
          importResponseSchema.parse({
            results: [makeResult(true), makeResult(false)],
            importedCount: 1,
            failedCount: 5,
          }),
        ).toThrow();
      });
    });

    describe('knowledgeListResponseSchema', () => {
      it('accepts when total matches items.length', () => {
        const result = knowledgeListResponseSchema.parse({
          items: [],
          nextCursor: null,
          total: 0,
        });
        expect(result.total).toBe(0);
      });

      it('rejects when total does not match items.length', () => {
        expect(() =>
          knowledgeListResponseSchema.parse({
            items: [],
            nextCursor: null,
            total: 5,
          }),
        ).toThrow();
      });
    });

    describe('skillReviewQueueResponseSchema', () => {
      it('accepts when items.length <= total', () => {
        const result = skillReviewQueueResponseSchema.parse({
          items: [],
          nextCursor: null,
          total: 10,
        });
        expect(result.total).toBe(10);
      });

      it('rejects when items.length > total', () => {
        expect(() =>
          skillReviewQueueResponseSchema.parse({
            items: [
              {
                artifact: {
                  id: 'a1',
                  teamId: null,
                  scope: 'global',
                  labels: ['tag'],
                  title: 'Test',
                  slug: 'test',
                  requiredLevel: 0,
                  sourceKind: 'skill-directory',
                  lifecycleState: 'approved',
                  currentRevision: 1,
                  fileManifest: [],
                  scriptDescriptors: [],
                  createdAt: validTimestamp,
                  updatedAt: validTimestamp,
                  createdBy: validActorRef,
                },
                revision: 1,
                agentReview: null,
                submittedBy: validActorRef,
                lastDecision: null,
              },
            ],
            nextCursor: null,
            total: 0,
          }),
        ).toThrow();
      });
    });
  });

  // =========================================================================
  // Format validation
  // =========================================================================
  describe('format validation', () => {
    describe('bundleFilePayloadSchema', () => {
      const validPayload = {
        path: 'scripts/run.sh',
        kind: 'script' as const,
        sha256: validSha256,
        sizeBytes: 512,
        mediaType: 'application/json',
        source: 'scripts/' as const,
        includeInDerivation: false,
        activationOnly: false,
        content: 'c2NyaXB0', // base64
      };

      it('accepts valid IANA media type', () => {
        const result = bundleFilePayloadSchema.parse({
          ...validPayload,
          mediaType: 'text/plain',
        });
        expect(result.mediaType).toBe('text/plain');
      });

      it('accepts media type with special chars', () => {
        const result = bundleFilePayloadSchema.parse({
          ...validPayload,
          mediaType: 'application/vnd.api+json',
        });
        expect(result.mediaType).toBe('application/vnd.api+json');
      });

      it('rejects invalid media type format', () => {
        expect(() =>
          bundleFilePayloadSchema.parse({
            ...validPayload,
            mediaType: 'not-a-valid-type',
          }),
        ).toThrow();
      });

      it('rejects media type with spaces', () => {
        expect(() =>
          bundleFilePayloadSchema.parse({
            ...validPayload,
            mediaType: 'text / plain',
          }),
        ).toThrow();
      });

      it('accepts valid hex sha256', () => {
        const result = bundleFilePayloadSchema.parse(validPayload);
        expect(result.sha256).toBe(validSha256);
      });

      it('rejects non-hex sha256', () => {
        expect(() =>
          bundleFilePayloadSchema.parse({
            ...validPayload,
            sha256: 'G'.repeat(64), // 'G' is not hex
          }),
        ).toThrow();
      });

      it('rejects uppercase hex sha256', () => {
        expect(() =>
          bundleFilePayloadSchema.parse({
            ...validPayload,
            sha256: 'A'.repeat(64), // uppercase hex
          }),
        ).toThrow();
      });
    });

    describe('bundleScriptDescriptorSchema', () => {
      const validDescriptor = {
        path: 'scripts/run.sh',
        sha256: validSha256,
        capability: 'Run tests',
        defaultPolicy: 'blocked' as const,
      };

      it('accepts valid hex sha256', () => {
        const result = bundleScriptDescriptorSchema.parse(validDescriptor);
        expect(result.sha256).toBe(validSha256);
      });

      it('rejects non-hex sha256', () => {
        expect(() =>
          bundleScriptDescriptorSchema.parse({
            ...validDescriptor,
            sha256: 'G'.repeat(64),
          }),
        ).toThrow();
      });

      it('rejects uppercase hex sha256', () => {
        expect(() =>
          bundleScriptDescriptorSchema.parse({
            ...validDescriptor,
            sha256: 'A'.repeat(64),
          }),
        ).toThrow();
      });
    });
  });

  // =========================================================================
  // Non-empty constraints
  // =========================================================================
  describe('non-empty constraints', () => {
    describe('skillReviewDecisionRequestSchema', () => {
      it('accepts notes with 2000 ASCII characters', () => {
        const result = skillReviewDecisionRequestSchema.parse({
          artifactId: 'art-1',
          decision: 'approve',
          notes: 'a'.repeat(2000),
        });
        expect(result.notes).toHaveLength(2000);
      });

      it('rejects notes exceeding 2000 Unicode characters', () => {
        expect(() =>
          skillReviewDecisionRequestSchema.parse({
            artifactId: 'art-1',
            decision: 'approve',
            notes: 'a'.repeat(2001),
          }),
        ).toThrow();
      });

      it('counts multi-byte emoji as single Unicode character', () => {
        // Each emoji is 1 Unicode code point but 2 UTF-16 code units
        const emojiNotes = '\u{1F600}'.repeat(2000); // 2000 emoji
        const result = skillReviewDecisionRequestSchema.parse({
          artifactId: 'art-1',
          decision: 'approve',
          notes: emojiNotes,
        });
        expect([...result.notes].length).toBe(2000);
      });

      it('rejects when Unicode character count exceeds 2000', () => {
        const emojiNotes = '\u{1F600}'.repeat(2001); // 2001 emoji
        expect(() =>
          skillReviewDecisionRequestSchema.parse({
            artifactId: 'art-1',
            decision: 'approve',
            notes: emojiNotes,
          }),
        ).toThrow();
      });
    });

    describe('statsUsageItemSchema', () => {
      it('accepts non-empty period', () => {
        const result = statsUsageItemSchema.parse({
          period: '2024-01',
          count: 10,
        });
        expect(result.period).toBe('2024-01');
      });

      it('rejects empty period', () => {
        expect(() =>
          statsUsageItemSchema.parse({
            period: '',
            count: 10,
          }),
        ).toThrow();
      });
    });
  });

  // =========================================================================
  // Conditional constraints
  // =========================================================================
  describe('conditional constraints', () => {
    describe('importResultItemSchema', () => {
      it('accepts success=true with non-null entry', () => {
        const result = importResultItemSchema.parse({
          success: true,
          entry: validKnowledgeEntry,
          error: null,
          source: 'json',
        });
        expect(result.success).toBe(true);
      });

      it('rejects success=true with null entry', () => {
        expect(() =>
          importResultItemSchema.parse({
            success: true,
            entry: null,
            error: null,
            source: 'json',
          }),
        ).toThrow();
      });

      it('accepts success=false with null entry', () => {
        const result = importResultItemSchema.parse({
          success: false,
          entry: null,
          error: 'some error',
          source: 'json',
        });
        expect(result.success).toBe(false);
      });
    });

    describe('artifactExportResponseSchema', () => {
      it('accepts bundle-json format with non-null bundle', () => {
        const result = artifactExportResponseSchema.parse({
          format: 'bundle-json',
          exportedAt: validTimestamp,
          exportedBy: validActorRef,
          bundle: {
            scope: 'global',
            labels: ['tag'],
            title: 'Test Bundle',
            slug: 'test-bundle',
            requiredLevel: 0,
            sourceKind: 'skill-directory',
            files: [
              {
                path: 'SKILL.md',
                kind: 'skill-markdown',
                sha256: validSha256,
                sizeBytes: 100,
                mediaType: 'text/markdown',
                source: 'SKILL.md',
                includeInDerivation: true,
                activationOnly: false,
                content: 'content',
              },
            ],
            scriptDescriptors: [],
          },
          distilled: null,
        });
        expect(result.format).toBe('bundle-json');
      });

      it('rejects bundle-json format with null bundle', () => {
        expect(() =>
          artifactExportResponseSchema.parse({
            format: 'bundle-json',
            exportedAt: validTimestamp,
            exportedBy: validActorRef,
            bundle: null,
            distilled: null,
          }),
        ).toThrow();
      });

      it('accepts distilled-json format with null bundle', () => {
        const result = artifactExportResponseSchema.parse({
          format: 'distilled-json',
          exportedAt: validTimestamp,
          exportedBy: validActorRef,
          bundle: null,
          distilled: {
            artifactId: 'art-1',
            scope: 'global',
            labels: ['tag'],
            title: 'Test',
            slug: 'test',
            requiredLevel: 0,
            sourceKind: 'skill-directory',
            profile: null,
            capsules: null,
            clientManifest: null,
            exportedAt: validTimestamp,
          },
        });
        expect(result.format).toBe('distilled-json');
      });
    });
  });

  // =========================================================================
  // Other validations
  // =========================================================================
  describe('other validations', () => {
    describe('distilledArtifactSchema', () => {
      it('accepts valid URL-safe slug', () => {
        const result = distilledArtifactSchema.parse({
          artifactId: 'art-1',
          scope: 'global',
          labels: ['tag'],
          title: 'Test Artifact',
          slug: 'my-cool-artifact',
          requiredLevel: 0,
          sourceKind: 'skill-directory',
          profile: null,
          capsules: null,
          clientManifest: null,
          exportedAt: validTimestamp,
        });
        expect(result.slug).toBe('my-cool-artifact');
      });

      it('accepts simple slug', () => {
        const result = distilledArtifactSchema.parse({
          artifactId: 'art-1',
          scope: 'global',
          labels: ['tag'],
          title: 'Test Artifact',
          slug: 'artifact',
          requiredLevel: 0,
          sourceKind: 'skill-directory',
          profile: null,
          capsules: null,
          clientManifest: null,
          exportedAt: validTimestamp,
        });
        expect(result.slug).toBe('artifact');
      });

      it('rejects slug with uppercase', () => {
        expect(() =>
          distilledArtifactSchema.parse({
            artifactId: 'art-1',
            scope: 'global',
            labels: ['tag'],
            title: 'Test Artifact',
            slug: 'My-Artifact',
            requiredLevel: 0,
            sourceKind: 'skill-directory',
            profile: null,
            capsules: null,
            clientManifest: null,
            exportedAt: validTimestamp,
          }),
        ).toThrow();
      });

      it('rejects slug with leading dash', () => {
        expect(() =>
          distilledArtifactSchema.parse({
            artifactId: 'art-1',
            scope: 'global',
            labels: ['tag'],
            title: 'Test Artifact',
            slug: '-artifact',
            requiredLevel: 0,
            sourceKind: 'skill-directory',
            profile: null,
            capsules: null,
            clientManifest: null,
            exportedAt: validTimestamp,
          }),
        ).toThrow();
      });

      it('rejects slug with trailing dash', () => {
        expect(() =>
          distilledArtifactSchema.parse({
            artifactId: 'art-1',
            scope: 'global',
            labels: ['tag'],
            title: 'Test Artifact',
            slug: 'artifact-',
            requiredLevel: 0,
            sourceKind: 'skill-directory',
            profile: null,
            capsules: null,
            clientManifest: null,
            exportedAt: validTimestamp,
          }),
        ).toThrow();
      });

      it('rejects slug with consecutive dashes', () => {
        // Actually consecutive dashes ARE invalid per the regex - each segment must be [a-z0-9]+
        // but the regex allows a single dash between segments
        expect(() =>
          distilledArtifactSchema.parse({
            artifactId: 'art-1',
            scope: 'global',
            labels: ['tag'],
            title: 'Test Artifact',
            slug: 'art--ifact',
            requiredLevel: 0,
            sourceKind: 'skill-directory',
            profile: null,
            capsules: null,
            clientManifest: null,
            exportedAt: validTimestamp,
          }),
        ).toThrow();
      });

      it('rejects slug with underscores', () => {
        expect(() =>
          distilledArtifactSchema.parse({
            artifactId: 'art-1',
            scope: 'global',
            labels: ['tag'],
            title: 'Test Artifact',
            slug: 'my_artifact',
            requiredLevel: 0,
            sourceKind: 'skill-directory',
            profile: null,
            capsules: null,
            clientManifest: null,
            exportedAt: validTimestamp,
          }),
        ).toThrow();
      });
    });

    describe('maintenanceEntryListRequestSchema', () => {
      it('accepts staleVerification=true with staleDays provided', () => {
        const result = maintenanceEntryListRequestSchema.parse({
          staleVerification: true,
          staleDays: 30,
        });
        expect(result.staleDays).toBe(30);
      });

      it('rejects staleVerification=true without staleDays', () => {
        expect(() =>
          maintenanceEntryListRequestSchema.parse({
            staleVerification: true,
          }),
        ).toThrow();
      });

      it('accepts staleVerification=false without staleDays', () => {
        const result = maintenanceEntryListRequestSchema.parse({
          staleVerification: false,
        });
        expect(result.staleDays).toBeUndefined();
      });

      it('accepts when neither staleVerification nor staleDays provided', () => {
        const result = maintenanceEntryListRequestSchema.parse({});
        // preprocess converts undefined to false
        expect(result.staleVerification).toBe(false);
        expect(result.staleDays).toBeUndefined();
      });
    });
  });
});
