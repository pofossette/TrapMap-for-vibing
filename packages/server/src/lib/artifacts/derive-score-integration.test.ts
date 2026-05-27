/**
 * Integration tests: derive → score pipeline (Phase D Task 1).
 *
 * Validates that contextualPrefix generated during capsule derivation
 * is correctly used by the retrieval scoring logic in capsule-recall.
 *
 * Tests the full pipeline:
 *   SKILL.md content → deriveFromPayloads() → SkillCapsule with contextualPrefix
 *   → rankCapsules() → CapsuleCandidate with contextScore
 */

import { describe, expect, it } from 'vitest';

import { deriveFromPayloads } from '@trapmap/server/lib/artifacts/derive.js';
import { rankCapsules } from '@trapmap/server/lib/retrieval/capsules/capsule-recall.js';
import type { ParsedIntent } from '@trapmap/server/lib/retrieval/types.js';
import type { ArtifactFilePayloadRecord } from '@trapmap/server/lib/store.js';
import { nowIso } from '@trapmap/server/lib/store.js';
import type {
  DerivedSkillCapsuleRecord,
  SkillArtifactRecord,
} from '@trapmap/server/lib/store/types/artifact-records.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const createdAt = nowIso();

function mockChat(response: string) {
  let callCount = 0;
  return {
    provider: 'mock',
    isConfigured: true,
    invoke: async () => {
      callCount++;
      if (callCount === 1) {
        return JSON.stringify({
          documentTitle: 'Docker Node Version Mismatch',
          documentLabels: ['docker', 'node'],
          capsules: [
            {
              capsuleIndex: 0,
              title: 'Docker Node Version',
              description: 'Resolving version conflicts',
              contentScope: 'Docker with Node.js',
              sourceType: 'skill-main',
              sourcePath: 'SKILL.md',
              tags: ['docker', 'node'],
            },
          ],
        });
      }
      return response;
    },
  };
}

const skillMdContent = `---
title: Docker Node Version Mismatch
labels:
  - docker
  - node
  - version
---

# Docker Node Version Mismatch

## Situation

When deploying containers with a Node.js application, the container's Node.js
version may be older or newer than the development environment.

## Problem

Container Node version older than development version causes runtime errors
and unexpected behavior in production.

## Goal

Pin Node version in Dockerfile to match the development environment.
Use multi-stage builds to ensure consistency.
`;

function buildArtifactFromCapsules(
  id: string,
  capsules: DerivedSkillCapsuleRecord[],
): SkillArtifactRecord {
  return {
    id,
    teamId: null,
    scope: 'global',
    labels: ['docker', 'node'],
    title: 'Docker Node Version Mismatch',
    slug: 'docker-node-version-mismatch',
    requiredLevel: 0,
    lifecycleState: 'approved',
    ownerUserId: 'user_1',
    latestRevision: {
      revision: 1,
      sourceHash: 'a'.repeat(64),
      files: [],
      submittedAt: createdAt,
      submittedByUserId: 'user_1',
      scriptDescriptors: [],
      derived: {
        profile: {
          artifactId: id,
          revision: 1,
          sourceHash: 'a'.repeat(64),
          title: 'Docker Node Version Mismatch',
          summary: 'Guide for Docker Node.js version management',
          keywords: ['docker', 'node'],
          referencePaths: [],
          contentHash: 'b'.repeat(64),
        },
        capsules,
        clientManifest: null,
        sourceHash: 'a'.repeat(64),
        derivedAt: createdAt,
      },
    },
    history: [],
    metadata: {
      sourceKind: 'skill-directory',
      submissionCount: 1,
      resubmissionCount: 0,
      revisionCount: 1,
      latestSubmissionId: null,
      latestSubmittedAt: null,
      latestReviewedAt: null,
      latestDecision: null,
    },
    agentReview: null,
    reviewHistory: [],
    reviewNotes: [],
    lifecycleHistory: [],
    boundary: null,
    decayMeta: null,
    evidenceMeta: null,
    maintenanceMeta: null,
    createdAt,
    updatedAt: createdAt,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('derive → score integration (Phase D)', () => {
  const filePayloads: ArtifactFilePayloadRecord[] = [
    {
      artifactId: 'artifact_1',
      revision: 1,
      path: 'SKILL.md',
      sha256: 'a'.repeat(64),
      sizeBytes: skillMdContent.length,
      mediaType: 'text/markdown',
      content: skillMdContent,
      storedAt: createdAt,
    },
  ];

  it('should derive capsules with contextualPrefix and score them higher', async () => {
    const chat = mockChat(
      'This is a Docker troubleshooting guide for Node.js container deployments, covering version mismatch between local and production environments.',
    );

    const derived = await deriveFromPayloads(filePayloads, {
      artifactId: 'artifact_1',
      labels: ['docker', 'node'],
      title: 'Docker Node Version Mismatch',
      scope: 'global',
      requiredLevel: 0,
      chat,
    });

    // Verify derivation produced contextualPrefix
    expect(derived.capsules.length).toBeGreaterThan(0);
    expect(derived.capsules[0]!.contextualPrefix).toBeDefined();
    expect(derived.capsules[0]!.contextualPrefix!.length).toBeLessThanOrEqual(300);
    expect(derived.capsules[0]!.contextualPrefix!.length).toBeGreaterThan(0);
    expect(derived.capsules[0]!.contextualPrefix!.length).toBeGreaterThan(0);

    // Build artifact with enriched capsules
    const enrichedArtifact = buildArtifactFromCapsules('artifact_1', derived.capsules);

    // Build artifact without contextualPrefix (backward compat)
    const plainCapsules = derived.capsules.map((c) => ({
      ...c,
      contextualPrefix: undefined,
      artifactId: 'artifact_2',
    }));
    const plainArtifact = buildArtifactFromCapsules('artifact_2', plainCapsules);

    // Score both against a matching intent
    const intent: ParsedIntent = {
      seed: 'docker troubleshooting container deployment version mismatch',
      normalized: 'docker troubleshooting container deployment version mismatch',
      situation: null,
      problem: 'docker troubleshooting container deployment version mismatch',
      goal: null,
      errorText: null,
      tokens: [
        { token: 'docker', original: 'docker', isTechnical: true },
        { token: 'troubleshooting', original: 'troubleshooting', isTechnical: false },
        { token: 'container', original: 'container', isTechnical: true },
        { token: 'deployment', original: 'deployment', isTechnical: false },
        { token: 'version', original: 'version', isTechnical: false },
        { token: 'mismatch', original: 'mismatch', isTechnical: false },
      ],
      stackPathHints: [],
      category: null,
      semanticQuery: null,
      parseMethod: 'regex',
    };

    const filters = {
      teamId: null,
      securityLevel: 5,
      isSystemAdmin: false,
      scopes: [] as Array<'global' | 'project'>,
      labels: [] as string[],
    };
    const ranked = rankCapsules([enrichedArtifact, plainArtifact], intent, filters, 10);

    expect(ranked.length).toBe(2);

    const enrichedCandidate = ranked.find((c) => c.artifactId === 'artifact_1');
    const plainCandidate = ranked.find((c) => c.artifactId === 'artifact_2');

    expect(enrichedCandidate).toBeDefined();
    expect(plainCandidate).toBeDefined();

    // Enriched capsule should have non-zero context score
    expect(enrichedCandidate!.contextScore).toBeGreaterThan(0);

    // Plain capsule should have zero context score
    expect(plainCandidate!.contextScore).toBe(0);

    // Enriched capsule should rank higher overall
    expect(enrichedCandidate!.finalScore).toBeGreaterThanOrEqual(plainCandidate!.finalScore);
  });

  it('should handle LLM failure gracefully and still produce rankable capsules', async () => {
    const failingChat = {
      provider: 'mock',
      isConfigured: true,
      invoke: async () => {
        throw new Error('LLM unavailable');
      },
    };

    const derived = await deriveFromPayloads(filePayloads, {
      artifactId: 'artifact_1',
      labels: ['docker', 'node'],
      title: 'Docker Node Version Mismatch',
      scope: 'global',
      requiredLevel: 0,
      chat: failingChat,
    });

    // Fallback prefix should be present
    expect(derived.capsules[0]!.contextualPrefix).toBeDefined();
    expect(derived.capsules[0]!.contextualPrefix).toContain('Docker Node Version Mismatch');

    // Should still be rankable
    const artifact = buildArtifactFromCapsules('artifact_1', derived.capsules);
    const intent: ParsedIntent = {
      seed: 'docker node version',
      normalized: 'docker node version',
      situation: null,
      problem: 'docker node version',
      goal: null,
      errorText: null,
      tokens: [{ token: 'docker', original: 'docker', isTechnical: true }],
      stackPathHints: [],
      category: null,
      semanticQuery: null,
      parseMethod: 'regex',
    };
    const filters = {
      teamId: null,
      securityLevel: 5,
      isSystemAdmin: false,
      scopes: [] as Array<'global' | 'project'>,
      labels: [] as string[],
    };

    const ranked = rankCapsules([artifact], intent, filters, 10);

    expect(ranked.length).toBe(1);
    expect(ranked[0]!.finalScore).toBeGreaterThanOrEqual(0);
    expect(ranked[0]!.finalScore).toBeLessThanOrEqual(1);
  });

  it('should produce backward-compatible capsules when no chat is provided', async () => {
    const derived = await deriveFromPayloads(filePayloads, {
      artifactId: 'artifact_1',
      labels: ['docker', 'node'],
      title: 'Docker Node Version Mismatch',
      scope: 'global',
      requiredLevel: 0,
      // No chat → no enrichment
    });

    // No contextualPrefix
    expect(derived.capsules[0]!.contextualPrefix).toBeUndefined();

    // Should still be rankable with contextScore = 0
    const artifact = buildArtifactFromCapsules('artifact_1', derived.capsules);
    const intent: ParsedIntent = {
      seed: 'docker node version',
      normalized: 'docker node version',
      situation: 'deploying containers',
      problem: 'version mismatch',
      goal: null,
      errorText: null,
      tokens: [
        { token: 'docker', original: 'docker', isTechnical: true },
        { token: 'node', original: 'node', isTechnical: true },
      ],
      stackPathHints: [{ hint: 'docker', kind: 'stack', confidence: 0.9 }],
      category: null,
      semanticQuery: null,
      parseMethod: 'regex',
    };
    const filters = {
      teamId: null,
      securityLevel: 5,
      isSystemAdmin: false,
      scopes: [] as Array<'global' | 'project'>,
      labels: [] as string[],
    };

    const ranked = rankCapsules([artifact], intent, filters, 10);

    expect(ranked.length).toBe(1);
    expect(ranked[0]!.contextScore).toBe(0);
    // Should still have a positive score from other dimensions
    expect(ranked[0]!.finalScore).toBeGreaterThan(0);
  });
});
