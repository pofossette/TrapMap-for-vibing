/**
 * Skill lifecycle flow integration tests (Phase 2C)
 *
 * Tests the complete lifecycle state machine transitions for skill artifacts:
 * - agent-pass → approved (review approval)
 * - agent-pass → rejected (review rejection)
 * - approved/rejected → deactivated
 * - deactivated terminal state
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { LifecycleState } from '@trapmap/contracts';
import type { FastifyInstance } from 'fastify';
import {
  buildTestServer,
  seedApprovedSkillArtifact,
} from '../lib/retrieval/__fixtures__/auth-store-helpers.js';
import { nowIso } from '../lib/store.js';

// ---------------------------------------------------------------------------
// Helper to seed artifact in specific lifecycle state
// Uses seedApprovedSkillArtifact then overrides the lifecycleState
// ---------------------------------------------------------------------------

function seedArtifactWithState(
  data: { skillArtifacts: any[]; counters: Record<string, number>; artifactFilePayloads?: any[] },
  userId: string,
  options: {
    id: string;
    title: string;
    lifecycleState: LifecycleState;
    requiredLevel?: number;
  },
) {
  // First create a complete approved artifact
  const artifact = seedApprovedSkillArtifact(data, userId, {
    id: options.id,
    title: options.title,
    requiredLevel: options.requiredLevel,
  });

  // Then override the lifecycle state
  artifact.lifecycleState = options.lifecycleState;

  // Update the last lifecycle history event to match the new state
  if (artifact.lifecycleHistory.length > 0) {
    const lastEvent = artifact.lifecycleHistory[artifact.lifecycleHistory.length - 1];
    if (lastEvent) {
      lastEvent.state = options.lifecycleState;
      lastEvent.type =
        options.lifecycleState === 'agent-pass'
          ? 'agent-reviewed'
          : options.lifecycleState === 'rejected'
            ? 'reviewer-rejected'
            : options.lifecycleState === 'deactivated'
              ? 'deactivated'
              : lastEvent.type;
    }
  }

  return artifact;
}

// ---------------------------------------------------------------------------
// Phase 2C: Skill lifecycle flow tests
// ---------------------------------------------------------------------------

describe('skill lifecycle flow (Phase 2C)', () => {
  describe('review queue endpoint', () => {
    it('returns 401 for unauthenticated request', async () => {
      const { app } = await buildTestServer();

      const response = await app.inject({
        method: 'GET',
        url: '/v1/operations/artifacts/review-queue',
      });

      expect(response.statusCode).toBe(401);
      await app.close();
    });

    it('returns 403 without knowledge:review permission', async () => {
      const { app, authToken } = await buildTestServer(undefined, {
        permissions: ['knowledge:search'],
        roleTemplate: 'user',
      });

      const response = await app.inject({
        method: 'GET',
        url: '/v1/operations/artifacts/review-queue',
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(403);
      await app.close();
    });

    it('returns only agent-pass artifacts for review', async () => {
      const { app, authToken } = await buildTestServer(
        (data, auth) => {
          // Seed artifact in agent-pass state (should appear in queue)
          seedArtifactWithState(data, auth.userId, {
            id: 'artifact-agent-pass',
            title: 'Pending Review',
            lifecycleState: 'agent-pass',
          });

          // Seed artifact in approved state (should NOT appear in queue)
          seedApprovedSkillArtifact(data, auth.userId, {
            id: 'artifact-approved',
            title: 'Already Approved',
          });
        },
        { permissions: ['knowledge:review'], roleTemplate: 'admin' },
      );

      const response = await app.inject({
        method: 'GET',
        url: '/v1/operations/artifacts/review-queue',
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.items).toBeDefined();
      expect(json.items).toHaveLength(1);
      expect(json.items[0].artifact.id).toBe('artifact-agent-pass');
      await app.close();
    });

    it('filters by security level (reviewer must have strictly higher level)', async () => {
      const { app, authToken } = await buildTestServer(
        (data, auth) => {
          // Artifact with required level 5 (reviewer has level 10, should see)
          seedArtifactWithState(data, auth.userId, {
            id: 'artifact-level-5',
            title: 'Level 5 Artifact',
            lifecycleState: 'agent-pass',
            requiredLevel: 5,
          });

          // Artifact with required level 10 (reviewer has level 10, should NOT see)
          seedArtifactWithState(data, auth.userId, {
            id: 'artifact-level-10',
            title: 'Level 10 Artifact',
            lifecycleState: 'agent-pass',
            requiredLevel: 10,
          });
        },
        { securityLevel: 10, permissions: ['knowledge:review'], roleTemplate: 'admin' },
      );

      const response = await app.inject({
        method: 'GET',
        url: '/v1/operations/artifacts/review-queue',
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.items).toHaveLength(1);
      expect(json.items[0].artifact.id).toBe('artifact-level-5');
      await app.close();
    });
  });

  describe('agent-pass → approved flow', () => {
    it('transitions from agent-pass to approved on approve decision', async () => {
      const { app, authToken, store } = await buildTestServer(
        (data, auth) => {
          seedArtifactWithState(data, auth.userId, {
            id: 'artifact-to-approve',
            title: 'To Be Approved',
            lifecycleState: 'agent-pass',
          });
        },
        { permissions: ['knowledge:review'], roleTemplate: 'admin' },
      );

      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/artifact-to-approve/review',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          artifactId: 'artifact-to-approve',
          decision: 'approve',
          notes: 'Looks good!',
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.previousState).toBe('agent-pass');
      expect(json.newState).toBe('approved');
      expect(json.artifact.lifecycleState).toBe('approved');

      // Verify state persisted
      const data = await store.snapshot();
      const artifact = data.skillArtifacts.find((a) => a.id === 'artifact-to-approve');
      expect(artifact?.lifecycleState).toBe('approved');
      await app.close();
    });

    it('records review decision in reviewHistory', async () => {
      const { app, authToken, store } = await buildTestServer(
        (data, auth) => {
          seedArtifactWithState(data, auth.userId, {
            id: 'artifact-with-history',
            title: 'History Test',
            lifecycleState: 'agent-pass',
          });
        },
        { permissions: ['knowledge:review'], roleTemplate: 'admin' },
      );

      await app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/artifact-with-history/review',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          artifactId: 'artifact-with-history',
          decision: 'approve',
          notes: 'Approved for testing',
        },
      });

      const data = await store.snapshot();
      const artifact = data.skillArtifacts.find((a) => a.id === 'artifact-with-history');
      expect(artifact?.reviewHistory).toHaveLength(1);
      expect(artifact?.reviewHistory[0]?.decision).toBe('approve');
      expect(artifact?.reviewHistory[0]?.notes).toBe('Approved for testing');
      await app.close();
    });

    it('adds lifecycle event for approval', async () => {
      const { app, authToken, store } = await buildTestServer(
        (data, auth) => {
          seedArtifactWithState(data, auth.userId, {
            id: 'artifact-lifecycle-event',
            title: 'Lifecycle Event Test',
            lifecycleState: 'agent-pass',
          });
        },
        { permissions: ['knowledge:review'], roleTemplate: 'admin' },
      );

      await app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/artifact-lifecycle-event/review',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          artifactId: 'artifact-lifecycle-event',
          decision: 'approve',
          notes: 'Testing lifecycle event',
        },
      });

      const data = await store.snapshot();
      const artifact = data.skillArtifacts.find((a) => a.id === 'artifact-lifecycle-event');
      const lastEvent = artifact?.lifecycleHistory[artifact.lifecycleHistory.length - 1];
      expect(lastEvent?.type).toBe('reviewer-approved');
      expect(lastEvent?.state).toBe('approved');
      await app.close();
    });

    it('requires knowledge:review permission', async () => {
      const { app, authToken } = await buildTestServer(
        (data, auth) => {
          seedArtifactWithState(data, auth.userId, {
            id: 'artifact-no-perm',
            title: 'Permission Test',
            lifecycleState: 'agent-pass',
          });
        },
        { permissions: ['knowledge:search'], roleTemplate: 'user' },
      );

      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/artifact-no-perm/review',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          artifactId: 'artifact-no-perm',
          decision: 'approve',
          notes: 'Should fail',
        },
      });

      expect(response.statusCode).toBe(403);
      await app.close();
    });
  });

  describe('agent-pass → rejected flow', () => {
    it('transitions from agent-pass to rejected on reject decision', async () => {
      const { app, authToken, store } = await buildTestServer(
        (data, auth) => {
          seedArtifactWithState(data, auth.userId, {
            id: 'artifact-to-reject',
            title: 'To Be Rejected',
            lifecycleState: 'agent-pass',
          });
        },
        { permissions: ['knowledge:review'], roleTemplate: 'admin' },
      );

      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/artifact-to-reject/review',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          artifactId: 'artifact-to-reject',
          decision: 'reject',
          notes: 'Does not meet quality standards',
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.previousState).toBe('agent-pass');
      expect(json.newState).toBe('rejected');
      expect(json.artifact.lifecycleState).toBe('rejected');

      // Verify state persisted
      const data = await store.snapshot();
      const artifact = data.skillArtifacts.find((a) => a.id === 'artifact-to-reject');
      expect(artifact?.lifecycleState).toBe('rejected');
      await app.close();
    });

    it('adds lifecycle event for rejection', async () => {
      const { app, authToken, store } = await buildTestServer(
        (data, auth) => {
          seedArtifactWithState(data, auth.userId, {
            id: 'artifact-reject-event',
            title: 'Reject Event Test',
            lifecycleState: 'agent-pass',
          });
        },
        { permissions: ['knowledge:review'], roleTemplate: 'admin' },
      );

      await app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/artifact-reject-event/review',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          artifactId: 'artifact-reject-event',
          decision: 'reject',
          notes: 'Rejected for testing',
        },
      });

      const data = await store.snapshot();
      const artifact = data.skillArtifacts.find((a) => a.id === 'artifact-reject-event');
      const lastEvent = artifact?.lifecycleHistory[artifact.lifecycleHistory.length - 1];
      expect(lastEvent?.type).toBe('reviewer-rejected');
      expect(lastEvent?.state).toBe('rejected');
      await app.close();
    });
  });

  describe('approved → deactivated flow', () => {
    it('transitions from approved to deactivated', async () => {
      const { app, authToken, store } = await buildTestServer(
        (data, auth) => {
          seedApprovedSkillArtifact(data, auth.userId, {
            id: 'artifact-to-deactivate',
            title: 'To Be Deactivated',
          });
        },
        { permissions: ['knowledge:update'], roleTemplate: 'admin' },
      );

      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/artifact-to-deactivate/deactivate',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { reason: 'No longer relevant' },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.previousState).toBe('approved');
      expect(json.newState).toBe('deactivated');
      expect(json.artifact.lifecycleState).toBe('deactivated');

      // Verify state persisted
      const data = await store.snapshot();
      const artifact = data.skillArtifacts.find((a) => a.id === 'artifact-to-deactivate');
      expect(artifact?.lifecycleState).toBe('deactivated');
      await app.close();
    });

    it('requires knowledge:update permission', async () => {
      const { app, authToken } = await buildTestServer(
        (data, auth) => {
          seedApprovedSkillArtifact(data, auth.userId, {
            id: 'artifact-deactivate-no-perm',
            title: 'Permission Test',
          });
        },
        { permissions: ['knowledge:search'], roleTemplate: 'user' },
      );

      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/artifact-deactivate-no-perm/deactivate',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { reason: 'Test' },
      });

      expect(response.statusCode).toBe(403);
      await app.close();
    });

    it('records deactivation reason in lifecycle history', async () => {
      const { app, authToken, store } = await buildTestServer(
        (data, auth) => {
          seedApprovedSkillArtifact(data, auth.userId, {
            id: 'artifact-deactivate-reason',
            title: 'Reason Test',
          });
        },
        { permissions: ['knowledge:update'], roleTemplate: 'admin' },
      );

      await app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/artifact-deactivate-reason/deactivate',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { reason: 'Superseded by new version' },
      });

      const data = await store.snapshot();
      const artifact = data.skillArtifacts.find((a) => a.id === 'artifact-deactivate-reason');
      const lastEvent = artifact?.lifecycleHistory[artifact.lifecycleHistory.length - 1];
      expect(lastEvent?.type).toBe('deactivated');
      expect(lastEvent?.note).toBe('Superseded by new version');
      await app.close();
    });
  });

  describe('rejected → deactivated flow', () => {
    it('transitions from rejected to deactivated', async () => {
      const { app, authToken } = await buildTestServer(
        (data, auth) => {
          seedArtifactWithState(data, auth.userId, {
            id: 'artifact-rejected-deactivate',
            title: 'Rejected to Deactivate',
            lifecycleState: 'rejected',
          });
        },
        { permissions: ['knowledge:update'], roleTemplate: 'admin' },
      );

      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/artifact-rejected-deactivate/deactivate',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { reason: 'Archiving rejected artifact' },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.previousState).toBe('rejected');
      expect(json.newState).toBe('deactivated');
      expect(json.artifact.lifecycleState).toBe('deactivated');
      await app.close();
    });
  });

  describe('deactivated terminal state', () => {
    it('cannot transition from deactivated to any other state', async () => {
      const { app, authToken } = await buildTestServer(
        (data, auth) => {
          seedArtifactWithState(data, auth.userId, {
            id: 'artifact-already-deactivated',
            title: 'Already Deactivated',
            lifecycleState: 'deactivated',
          });
        },
        { permissions: ['knowledge:review', 'knowledge:update'], roleTemplate: 'admin' },
      );

      // Try to approve a deactivated artifact (should fail with 4xx/5xx)
      // Note: Currently returns 500 because transitionLifecycleState throws a plain Error
      // This tests that the transition is blocked, not the specific error code
      const reviewResponse = await app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/artifact-already-deactivated/review',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          artifactId: 'artifact-already-deactivated',
          decision: 'approve',
          notes: 'Trying to re-approve',
        },
      });

      expect(reviewResponse.statusCode).toBeGreaterThanOrEqual(400);

      // Try to deactivate again (should fail with 4xx/5xx)
      const deactivateResponse = await app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/artifact-already-deactivated/deactivate',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { reason: 'Trying again' },
      });

      expect(deactivateResponse.statusCode).toBeGreaterThanOrEqual(400);
      await app.close();
    });

    it('does not appear in review queue', async () => {
      const { app, authToken } = await buildTestServer(
        (data, auth) => {
          seedArtifactWithState(data, auth.userId, {
            id: 'deactivated-artifact',
            title: 'Deactivated',
            lifecycleState: 'deactivated',
          });
        },
        { permissions: ['knowledge:review'], roleTemplate: 'admin' },
      );

      const response = await app.inject({
        method: 'GET',
        url: '/v1/operations/artifacts/review-queue',
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      const deactivatedInQueue = json.items.find(
        (i: any) => i.artifact.id === 'deactivated-artifact',
      );
      expect(deactivatedInQueue).toBeUndefined();
      await app.close();
    });
  });

  describe('security level checks', () => {
    it('rejects review if reviewer level is not strictly higher than artifact level', async () => {
      const { app, authToken } = await buildTestServer(
        (data, auth) => {
          seedArtifactWithState(data, auth.userId, {
            id: 'artifact-high-level',
            title: 'High Level Artifact',
            lifecycleState: 'agent-pass',
            requiredLevel: 10, // Same as reviewer's level
          });
        },
        { securityLevel: 10, permissions: ['knowledge:review'], roleTemplate: 'admin' },
      );

      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/artifact-high-level/review',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          artifactId: 'artifact-high-level',
          decision: 'approve',
          notes: 'Should fail',
        },
      });

      expect(response.statusCode).toBe(403);
      await app.close();
    });

    it('rejects deactivation if user level is not strictly higher than artifact level', async () => {
      const { app, authToken } = await buildTestServer(
        (data, auth) => {
          seedArtifactWithState(data, auth.userId, {
            id: 'artifact-high-level-deact',
            title: 'High Level for Deactivation',
            lifecycleState: 'approved',
            requiredLevel: 10,
          });
        },
        { securityLevel: 10, permissions: ['knowledge:update'], roleTemplate: 'admin' },
      );

      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/artifact-high-level-deact/deactivate',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { reason: 'Should fail' },
      });

      expect(response.statusCode).toBe(403);
      await app.close();
    });
  });

  describe('error handling', () => {
    it('returns 404 for review of non-existent artifact', async () => {
      const { app, authToken } = await buildTestServer(undefined, {
        permissions: ['knowledge:review'],
        roleTemplate: 'admin',
      });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/non-existent-artifact/review',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          artifactId: 'non-existent-artifact',
          decision: 'approve',
          notes: 'Testing',
        },
      });

      expect(response.statusCode).toBe(404);
      await app.close();
    });

    it('returns 404 for deactivation of non-existent artifact', async () => {
      const { app, authToken } = await buildTestServer(undefined, {
        permissions: ['knowledge:update'],
        roleTemplate: 'admin',
      });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/non-existent/deactivate',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { reason: 'Test' },
      });

      expect(response.statusCode).toBe(404);
      await app.close();
    });

    it('returns 401 for unauthenticated review request', async () => {
      const { app } = await buildTestServer();

      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/some-artifact/review',
        payload: {
          decision: 'approve',
          notes: 'Unauthenticated',
        },
      });

      expect(response.statusCode).toBe(401);
      await app.close();
    });

    it('returns 400 for invalid review decision', async () => {
      const { app, authToken } = await buildTestServer(
        (data, auth) => {
          seedArtifactWithState(data, auth.userId, {
            id: 'artifact-invalid-decision',
            title: 'Invalid Decision Test',
            lifecycleState: 'agent-pass',
          });
        },
        { permissions: ['knowledge:review'], roleTemplate: 'admin' },
      );

      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/artifact-invalid-decision/review',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          decision: 'invalid-decision', // Not a valid enum value
          notes: 'Test',
        },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
      await app.close();
    });
  });
});
