import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { KnowledgeSubmission } from '@trapmap/contracts';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../../app.js';
import { detectDuplicates, parseClaudeSkill } from '../../lib/import-export.js';
import type { KnowledgeRecord } from '../../lib/store.js';

describe('operations routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = buildServer();
    await app.ready();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('POST /v1/operations/import', () => {
    it('returns 401 for unauthenticated request', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/import',
        payload: {
          entries: [
            {
              scope: 'project',
              labels: ['test'],
              shortcut: 'Test shortcut',
              detail: 'Test detail',
              source: 'json',
              requestedLevel: 1,
            },
          ],
        },
      });

      expect(response.statusCode).toBe(401);
      const json = response.json();
      expect(json.code).toBeDefined();
    });

    it('returns 400 for missing entries array', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/import',
        payload: {},
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('returns 400 for empty entries array', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/import',
        payload: {
          entries: [],
        },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('accepts valid import request schema', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/import',
        payload: {
          entries: [
            {
              scope: 'project',
              labels: ['test', 'imported'],
              shortcut: 'Valid shortcut',
              detail: 'Valid detail content for testing import',
              source: 'json',
              requestedLevel: 1,
            },
          ],
        },
      });

      // Should require auth, not fail on schema
      expect(response.statusCode).toBe(401);
    });
  });

  describe('import-export utilities', () => {
    describe('parseClaudeSkill', () => {
      it('parses valid SKILL.md with frontmatter', () => {
        const content = `---
name: Test Skill
description: A test skill for parsing
version: 1.0.0
---
# Test Skill Content

This is the body of the skill.`;

        const result = parseClaudeSkill(content);

        expect(result).not.toBeNull();
        expect(result?.shortcut).toBe('Test Skill');
        expect(result?.detail).toContain('Test Skill Content');
        expect(result?.scope).toBe('project');
        expect(result?.labels).toEqual(['imported', 'skill']);
      });

      it('returns null for invalid content without frontmatter', () => {
        const content = `This is just regular content
without any frontmatter.`;

        const result = parseClaudeSkill(content);

        expect(result).toBeNull();
      });

      it('returns null for content missing name field', () => {
        const content = `---
description: A skill without a name
---
Some content here.`;

        const result = parseClaudeSkill(content);

        expect(result).toBeNull();
      });

      it('uses body content as detail when available', () => {
        const content = `---
name: Skill Name
---
This is the body content.`;

        const result = parseClaudeSkill(content);

        expect(result?.detail).toBe('This is the body content.');
      });

      it('handles description field in frontmatter', () => {
        const content = `---
name: Skill Name
description: A skill description
---
Some body content.`;

        const result = parseClaudeSkill(content);

        expect(result).not.toBeNull();
        expect(result?.shortcut).toBe('Skill Name');
      });

      it('handles quoted YAML values without changing legacy import output', () => {
        const content = `---
name: "Quoted Skill"
description: 'Quoted description'
labels:
  - parsing
  - mime
---
Quoted body content.`;

        const result = parseClaudeSkill(content);

        expect(result).not.toBeNull();
        expect(result?.shortcut).toBe('Quoted Skill');
        expect(result?.detail).toBe('Quoted body content.');
        expect(result?.labels).toEqual(['imported', 'skill']);
      });
    });

    describe('detectDuplicates', () => {
      const createMockEntry = (overrides: Partial<KnowledgeRecord> = {}): KnowledgeRecord => ({
        id: 'knowledge_1',
        teamId: null,
        scope: 'project',
        labels: ['test'],
        shortcut: 'Test Shortcut',
        detail: 'This is a test detail for duplicate detection',
        requiredLevel: 1,
        lifecycleState: 'approved',
        ownerUserId: 'user_1',
        latestRevision: {
          revision: 1,
          submittedAt: '2024-01-01T00:00:00Z',
          submittedByUserId: 'user_1',
          shortcut: 'Test Shortcut',
          detail: 'This is a test detail for duplicate detection',
          labels: ['test'],
          reviewNotes: [],
        },
        history: [],
        metadata: {
          scopeLabel: 'project-knowledge',
          submissionCount: 1,
          resubmissionCount: 0,
          revisionCount: 1,
          latestSubmissionId: null,
          latestSubmittedAt: null,
          latestReviewedAt: null,
          latestDecision: null,
        },
        latestSubmissionId: null,
        submissionHistory: [],
        agentReview: null,
        reviewHistory: [],
        reviewNotes: [],
        lifecycleHistory: [],
        embeddingCache: null,
        indexState: null,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        ...overrides,
      });

      it('detects duplicate by identical shortcut (case-insensitive)', () => {
        const submission: KnowledgeSubmission = {
          scope: 'project',
          labels: ['test'],
          shortcut: 'TEST SHORTCUT', // Same as entry, different case
          detail: 'Different detail content',
        };

        const existing = [createMockEntry({ shortcut: 'Test Shortcut' })];
        const duplicates = detectDuplicates(submission, existing);

        expect(duplicates).toHaveLength(1);
        expect(duplicates[0]?.shortcut).toBe('Test Shortcut');
      });

      it('detects duplicate by similar detail content', () => {
        const submission: KnowledgeSubmission = {
          scope: 'project',
          labels: ['test'],
          shortcut: 'Different Shortcut',
          detail: 'This is a test detail for duplicate detection', // Very similar to existing
        };

        const existing = [createMockEntry({ shortcut: 'Other Shortcut' })];
        const duplicates = detectDuplicates(submission, existing);

        expect(duplicates).toHaveLength(1);
      });

      it('returns empty array when no duplicates found', () => {
        const submission: KnowledgeSubmission = {
          scope: 'project',
          labels: ['test'],
          shortcut: 'Unique Shortcut',
          detail: 'Completely unique and different content here',
        };

        const existing = [createMockEntry()];
        const duplicates = detectDuplicates(submission, existing);

        expect(duplicates).toHaveLength(0);
      });

      it('returns multiple duplicates when both shortcut and detail match', () => {
        const submission: KnowledgeSubmission = {
          scope: 'project',
          labels: ['test'],
          shortcut: 'Test Shortcut', // Matches first entry
          detail: 'This is a test detail for duplicate detection', // Matches second entry
        };

        const existing = [
          createMockEntry({
            id: 'knowledge_1',
            shortcut: 'Test Shortcut',
            detail: 'Different detail',
          }),
          createMockEntry({
            id: 'knowledge_2',
            shortcut: 'Other Shortcut',
            detail: 'This is a test detail for duplicate detection',
          }),
        ];

        const duplicates = detectDuplicates(submission, existing);

        expect(duplicates).toHaveLength(2);
      });
    });
  });

  describe('single-skill-md compatibility (IMEX-03)', () => {
    it('accepts minimal artifact bundle with single SKILL.md file', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/import',
        payload: {
          bundles: [
            {
              scope: 'project',
              labels: ['imported'],
              title: 'Single File Skill',
              slug: 'single-file-skill',
              requiredLevel: 1,
              sourceKind: 'single-skill-md',
              files: [
                {
                  path: 'SKILL.md',
                  sha256: 'a'.repeat(64),
                  sizeBytes: 100,
                  mediaType: 'text/markdown',
                  content: '# Single File Skill\n\nContent here',
                },
              ],
              scriptDescriptors: [],
            },
          ],
        },
      });

      // Should require auth, not fail schema validation
      expect(response.statusCode).toBe(401);
    });

    it('rejects single-skill-md bundle with multiple files', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/import',
        payload: {
          bundles: [
            {
              scope: 'project',
              labels: ['imported'],
              title: 'Invalid Single File',
              slug: 'invalid-single-file',
              requiredLevel: 1,
              sourceKind: 'single-skill-md',
              files: [
                {
                  path: 'SKILL.md',
                  sha256: 'a'.repeat(64),
                  sizeBytes: 100,
                  mediaType: 'text/markdown',
                  content: '# SKILL.md',
                },
                {
                  path: 'references/extra.md',
                  sha256: 'b'.repeat(64),
                  sizeBytes: 50,
                  mediaType: 'text/markdown',
                  content: '# Extra',
                },
              ],
              scriptDescriptors: [],
            },
          ],
        },
      });

      // Should fail validation (too many files for single-skill-md)
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('rejects single-skill-md bundle with non-SKILL.md file', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/import',
        payload: {
          bundles: [
            {
              scope: 'project',
              labels: ['imported'],
              title: 'Wrong File',
              slug: 'wrong-file',
              requiredLevel: 1,
              sourceKind: 'single-skill-md',
              files: [
                {
                  path: 'README.md',
                  sha256: 'c'.repeat(64),
                  sizeBytes: 100,
                  mediaType: 'text/markdown',
                  content: '# README',
                },
              ],
              scriptDescriptors: [],
            },
          ],
        },
      });

      // Should fail validation (wrong file path for single-skill-md)
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('rejects single-skill-md bundle with script descriptors', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/import',
        payload: {
          bundles: [
            {
              scope: 'project',
              labels: ['imported'],
              title: 'Script with Single File',
              slug: 'script-single-file',
              requiredLevel: 1,
              sourceKind: 'single-skill-md',
              files: [
                {
                  path: 'SKILL.md',
                  sha256: 'd'.repeat(64),
                  sizeBytes: 100,
                  mediaType: 'text/markdown',
                  content: '# SKILL.md',
                },
              ],
              scriptDescriptors: [
                {
                  path: 'scripts/setup.sh',
                  sha256: 'e'.repeat(64),
                  capability: 'Setup capability',
                  argsSchemaSummary: '',
                  sideEffectSummary: '',
                  defaultPolicy: 'manual',
                },
              ],
            },
          ],
        },
      });

      // Should fail validation (script descriptors not allowed for single-skill-md)
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });
  });
});
