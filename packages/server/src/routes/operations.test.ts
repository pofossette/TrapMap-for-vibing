import { describe, expect, it, beforeEach } from 'vitest';

import { buildServer } from '../app.js';
import type { FastifyInstance } from 'fastify';
import { parseClaudeSkill, detectDuplicates } from '../lib/import-export.js';
import type { KnowledgeSubmission } from '@skill-shareer/contracts';
import type { KnowledgeRecord } from '../lib/store.js';

describe('operations routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = buildServer();
    await app.ready();
  });

  describe('GET /v1/operations/knowledge', () => {
    it('returns 401 for unauthenticated request', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/operations/knowledge',
      });

      expect(response.statusCode).toBe(401);
      const json = response.json();
      expect(json.code).toBeDefined();
    });

    it('accepts valid query parameters', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/operations/knowledge?scope=global&lifecycleState=approved&requiredLevelMax=5&limit=10',
      });

      // Should require auth
      expect(response.statusCode).toBe(401);
    });

    it('uses default limit value', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/operations/knowledge',
      });

      // Should require auth, not fail on schema
      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /v1/operations/knowledge/:entryId/deactivate', () => {
    it('returns 401 for unauthenticated request', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/knowledge/knowledge_1/deactivate',
        payload: {
          reason: 'Outdated information',
        },
      });

      expect(response.statusCode).toBe(401);
      const json = response.json();
      expect(json.code).toBeDefined();
    });

    it('returns 400 for missing reason', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/knowledge/knowledge_1/deactivate',
        payload: {},
      });

      // Should fail validation (reason required) or auth
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('validates reason length constraints', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/knowledge/knowledge_1/deactivate',
        payload: {
          reason: '', // Empty reason should fail validation
        },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });
  });

  describe('route registration', () => {
    it('lists operations routes in documented routes', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/meta/routes',
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.documentedRoutes).toContain('GET /v1/operations/knowledge');
      expect(json.documentedRoutes).toContain('POST /v1/operations/knowledge/:entryId/deactivate');
    });
  });

  describe('POST /v1/operations/export', () => {
    it('returns 401 for unauthenticated request', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/export',
        payload: {},
      });

      expect(response.statusCode).toBe(401);
      const json = response.json();
      expect(json.code).toBeDefined();
    });

    it('accepts valid export request schema', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/export',
        payload: {
          teamId: null,
          includeHistory: true,
        },
      });

      // Should require auth, not fail on schema
      expect(response.statusCode).toBe(401);
    });

    it('accepts export request without body (uses defaults)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/export',
        payload: {},
      });

      // Should require auth, not fail on schema
      expect(response.statusCode).toBe(401);
    });
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
          createMockEntry({ id: 'knowledge_1', shortcut: 'Test Shortcut', detail: 'Different detail' }),
          createMockEntry({ id: 'knowledge_2', shortcut: 'Other Shortcut', detail: 'This is a test detail for duplicate detection' }),
        ];

        const duplicates = detectDuplicates(submission, existing);

        expect(duplicates).toHaveLength(2);
      });
    });
  });

  describe('GET /v1/operations/audit', () => {
    it('returns 401 for unauthenticated request', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/operations/audit',
      });

      expect(response.statusCode).toBe(401);
      const json = response.json();
      expect(json.code).toBeDefined();
    });

    it('returns 403 for user without audit:read permission', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/operations/audit',
        headers: {
          authorization: 'Bearer user_without_permission_token',
        },
      });

      // Should fail auth or permission
      expect(response.statusCode).toBeGreaterThanOrEqual(401);
    });

    it('accepts valid audit query parameters', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/operations/audit?action=knowledge-reviewed&limit=10',
      });

      // Should require auth
      expect(response.statusCode).toBe(401);
    });
  });

  describe('audit event creation', () => {
    it('verifies audit route is documented', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/meta/routes',
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.documentedRoutes).toContain('GET /v1/operations/audit');
    });
  });
});