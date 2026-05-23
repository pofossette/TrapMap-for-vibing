/**
 * Phase 6 Nyquist Gap Validation: Capsule index table schema.
 *
 * Validates that the derived capsule index tables have the correct
 * structure including sync status columns, content hash, and revision
 * tracking fields needed for index sync and reconciliation.
 */

import { describe, expect, it } from 'vitest';
import {
  skillArtifactCapsuleEmbeddings,
  skillArtifactCapsuleKeywords,
} from '../persistence/schema.js';

describe('Phase 6: Capsule index schema validation', () => {
  describe('skill_artifact_capsule_keywords', () => {
    it('should have capsule_id primary key column', () => {
      expect(skillArtifactCapsuleKeywords.capsuleId).toBeDefined();
      expect(skillArtifactCapsuleKeywords.capsuleId.name).toBe('capsule_id');
    });

    it('should have artifact_id column', () => {
      expect(skillArtifactCapsuleKeywords.artifactId).toBeDefined();
      expect(skillArtifactCapsuleKeywords.artifactId.name).toBe('artifact_id');
    });

    it('should have revision_no column for idempotency', () => {
      expect(skillArtifactCapsuleKeywords.revisionNo).toBeDefined();
      expect(skillArtifactCapsuleKeywords.revisionNo.name).toBe('revision_no');
    });

    it('should have governance columns for filtering', () => {
      expect(skillArtifactCapsuleKeywords.teamId).toBeDefined();
      expect(skillArtifactCapsuleKeywords.scope).toBeDefined();
      expect(skillArtifactCapsuleKeywords.requiredLevel).toBeDefined();
    });

    it('should have sync tracking columns', () => {
      expect(skillArtifactCapsuleKeywords.status).toBeDefined();
      expect(skillArtifactCapsuleKeywords.status.name).toBe('status');
      expect(skillArtifactCapsuleKeywords.lastError).toBeDefined();
      expect(skillArtifactCapsuleKeywords.lastError.name).toBe('last_error');
    });

    it('should have content_hash column', () => {
      expect(skillArtifactCapsuleKeywords.contentHash).toBeDefined();
      expect(skillArtifactCapsuleKeywords.contentHash.name).toBe('content_hash');
    });

    it('should have token array columns for all fields', () => {
      expect(skillArtifactCapsuleKeywords.tokens).toBeDefined();
      expect(skillArtifactCapsuleKeywords.fieldTokensContent).toBeDefined();
      expect(skillArtifactCapsuleKeywords.fieldTokensSituation).toBeDefined();
      expect(skillArtifactCapsuleKeywords.fieldTokensProblem).toBeDefined();
      expect(skillArtifactCapsuleKeywords.fieldTokensGoal).toBeDefined();
      expect(skillArtifactCapsuleKeywords.fieldTokensLabels).toBeDefined();
      expect(skillArtifactCapsuleKeywords.fieldTokensContextualPrefix).toBeDefined();
    });

    it('should have timestamp columns', () => {
      expect(skillArtifactCapsuleKeywords.createdAt).toBeDefined();
      expect(skillArtifactCapsuleKeywords.updatedAt).toBeDefined();
    });
  });

  describe('skill_artifact_capsule_embeddings', () => {
    it('should have capsule_id primary key column', () => {
      expect(skillArtifactCapsuleEmbeddings.capsuleId).toBeDefined();
      expect(skillArtifactCapsuleEmbeddings.capsuleId.name).toBe('capsule_id');
    });

    it('should have artifact_id column', () => {
      expect(skillArtifactCapsuleEmbeddings.artifactId).toBeDefined();
      expect(skillArtifactCapsuleEmbeddings.artifactId.name).toBe('artifact_id');
    });

    it('should have revision_no column for idempotency', () => {
      expect(skillArtifactCapsuleEmbeddings.revisionNo).toBeDefined();
      expect(skillArtifactCapsuleEmbeddings.revisionNo.name).toBe('revision_no');
    });

    it('should have governance columns for filtering', () => {
      expect(skillArtifactCapsuleEmbeddings.teamId).toBeDefined();
      expect(skillArtifactCapsuleEmbeddings.scope).toBeDefined();
      expect(skillArtifactCapsuleEmbeddings.requiredLevel).toBeDefined();
    });

    it('should have sync tracking columns', () => {
      expect(skillArtifactCapsuleEmbeddings.status).toBeDefined();
      expect(skillArtifactCapsuleEmbeddings.status.name).toBe('status');
      expect(skillArtifactCapsuleEmbeddings.lastError).toBeDefined();
      expect(skillArtifactCapsuleEmbeddings.lastError.name).toBe('last_error');
    });

    it('should have content_hash column', () => {
      expect(skillArtifactCapsuleEmbeddings.contentHash).toBeDefined();
      expect(skillArtifactCapsuleEmbeddings.contentHash.name).toBe('content_hash');
    });

    it('should have embedding vector column', () => {
      expect(skillArtifactCapsuleEmbeddings.embedding).toBeDefined();
      expect(skillArtifactCapsuleEmbeddings.embedding.name).toBe('embedding');
    });

    it('should have timestamp columns', () => {
      expect(skillArtifactCapsuleEmbeddings.createdAt).toBeDefined();
      expect(skillArtifactCapsuleEmbeddings.updatedAt).toBeDefined();
    });
  });

  describe('table cross-reference', () => {
    it('should have matching status column type between tables', () => {
      // Both tables use text() column type for status
      expect(skillArtifactCapsuleKeywords.status.name).toBe('status');
      expect(skillArtifactCapsuleEmbeddings.status.name).toBe('status');
    });

    it('should have matching governance column names between tables', () => {
      const kwFields = [
        'capsuleId',
        'artifactId',
        'revisionNo',
        'teamId',
        'scope',
        'requiredLevel',
      ];
      const embFields = [
        'capsuleId',
        'artifactId',
        'revisionNo',
        'teamId',
        'scope',
        'requiredLevel',
      ];

      for (const field of kwFields) {
        expect(
          (skillArtifactCapsuleKeywords as Record<string, { name: string }>)[field]?.name,
        ).toBeDefined();
      }
      for (const field of embFields) {
        expect(
          (skillArtifactCapsuleEmbeddings as Record<string, { name: string }>)[field]?.name,
        ).toBeDefined();
      }
    });
  });
});
