/**
 * Tests for capsule recall helpers (Phase 14 Task 2, Phase C Contextual Enrichment).
 *
 * This module covers:
 * - RETR-03: Capsule-native recall from artifact-derived outputs
 * - CAPS-04: Capsule ranking with intent signals and stack/path boosts
 * - CAPS-04-CTX: Context-aware scoring using contextual prefixes
 * - T-14-04: Preserve approval/team/level filtering before ranking
 * - T-14-06: Rank only distilled profile/capsule text, not raw payloads
 */

import { beforeEach, describe, expect, it } from 'vitest';

import type { ParsedIntent } from '@trapmap/server/lib/retrieval/types.js';
import type {
  DerivedSkillCapsuleRecord,
  DerivedSkillProfileRecord,
  SkillArtifactRecord,
} from '@trapmap/server/lib/store.js';
import { nowIso } from '@trapmap/server/lib/store.js';
import {
  buildProfileShortlist,
  extractGovernedCapsules,
  getCapsuleRecords,
  isArtifactGovernanceEligible,
  rankCapsules,
} from './capsule-recall.js';

describe('capsule recall (RETR-03, CAPS-04, Phase 14 Task 2)', () => {
  const userId = 'user_1';
  const teamId = 'team_1';
  const otherTeamId = 'team_2';
  const createdAt = nowIso();

  // Helper to create a mock artifact with derived outputs
  function createMockArtifact(overrides: {
    id: string;
    teamId: string | null;
    scope: 'global' | 'project';
    lifecycleState: 'approved' | 'submitted' | 'agent-pass' | 'rejected';
    requiredLevel: number;
    title: string;
    labels: string[];
    capsules: DerivedSkillCapsuleRecord[];
    profile?: DerivedSkillProfileRecord | null;
  }): SkillArtifactRecord {
    return {
      id: overrides.id,
      teamId: overrides.teamId,
      scope: overrides.scope,
      labels: overrides.labels,
      title: overrides.title,
      slug: overrides.title.toLowerCase().replace(/\s+/g, '-'),
      requiredLevel: overrides.requiredLevel,
      lifecycleState: overrides.lifecycleState,
      ownerUserId: userId,
      latestRevision: {
        revision: 1,
        sourceHash: 'a'.repeat(64),
        files: [],
        submittedAt: createdAt,
        submittedByUserId: userId,
        scriptDescriptors: [],
        derived: {
          profile: overrides.profile ?? {
            artifactId: overrides.id,
            revision: 1,
            sourceHash: 'a'.repeat(64),
            title: overrides.title,
            summary: `Summary for ${overrides.title}`,
            keywords: overrides.labels,
            referencePaths: [],
            contentHash: 'b'.repeat(64),
          },
          capsules: overrides.capsules,
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

  // Helper to create a mock capsule
  function createMockCapsule(overrides: {
    capsuleId: string;
    artifactId: string;
    situation: string;
    problem: string;
    goal: string;
    labels: string[];
    scope: 'global' | 'project';
    requiredLevel: number;
    contextualPrefix?: string;
  }): DerivedSkillCapsuleRecord {
    return {
      capsuleId: overrides.capsuleId,
      artifactId: overrides.artifactId,
      revision: 1,
      sourcePaths: ['SKILL.md'],
      content: `Content for ${overrides.problem}`,
      situation: overrides.situation,
      problem: overrides.problem,
      goal: overrides.goal,
      errorText: null,
      contextualPrefix: overrides.contextualPrefix,
      labels: overrides.labels,
      scope: overrides.scope,
      requiredLevel: overrides.requiredLevel,
    };
  }

  let approvedGlobalArtifact: SkillArtifactRecord;
  let approvedTeamArtifact: SkillArtifactRecord;
  let unapprovedArtifact: SkillArtifactRecord;
  let highLevelArtifact: SkillArtifactRecord;
  let otherTeamArtifact: SkillArtifactRecord;

  beforeEach(() => {
    approvedGlobalArtifact = createMockArtifact({
      id: 'artifact_1',
      teamId: null,
      scope: 'global',
      lifecycleState: 'approved',
      requiredLevel: 0,
      title: 'Docker Node Version Mismatch',
      labels: ['docker', 'node', 'version'],
      capsules: [
        createMockCapsule({
          capsuleId: 'capsule_1',
          artifactId: 'artifact_1',
          situation: 'When deploying containers with a Node.js application',
          problem: 'Container Node version older than development version',
          goal: 'Pin Node version in Dockerfile',
          labels: ['docker', 'node'],
          scope: 'global',
          requiredLevel: 0,
        }),
      ],
    });

    approvedTeamArtifact = createMockArtifact({
      id: 'artifact_2',
      teamId: teamId,
      scope: 'project',
      lifecycleState: 'approved',
      requiredLevel: 3,
      title: 'TypeScript Strict Null Checks',
      labels: ['typescript', 'null', 'strict'],
      capsules: [
        createMockCapsule({
          capsuleId: 'capsule_2',
          artifactId: 'artifact_2',
          situation: 'When enabling TypeScript strict mode',
          problem: 'Null reference errors at compile time',
          goal: 'Enable strictNullChecks in tsconfig',
          labels: ['typescript'],
          scope: 'project',
          requiredLevel: 3,
        }),
      ],
    });

    unapprovedArtifact = createMockArtifact({
      id: 'artifact_3',
      teamId: teamId,
      scope: 'project',
      lifecycleState: 'submitted',
      requiredLevel: 3,
      title: 'Unapproved Artifact',
      labels: ['unapproved'],
      capsules: [
        createMockCapsule({
          capsuleId: 'capsule_3',
          artifactId: 'artifact_3',
          situation: 'When testing',
          problem: 'Should not appear',
          goal: 'Should not appear',
          labels: ['unapproved'],
          scope: 'project',
          requiredLevel: 3,
        }),
      ],
    });

    highLevelArtifact = createMockArtifact({
      id: 'artifact_4',
      teamId: teamId,
      scope: 'project',
      lifecycleState: 'approved',
      requiredLevel: 10, // Higher than typical user
      title: 'High Security Artifact',
      labels: ['security', 'admin'],
      capsules: [
        createMockCapsule({
          capsuleId: 'capsule_4',
          artifactId: 'artifact_4',
          situation: 'When handling sensitive data',
          problem: 'Security vulnerability',
          goal: 'Encrypt data at rest',
          labels: ['security'],
          scope: 'project',
          requiredLevel: 10,
        }),
      ],
    });

    otherTeamArtifact = createMockArtifact({
      id: 'artifact_5',
      teamId: otherTeamId,
      scope: 'project',
      lifecycleState: 'approved',
      requiredLevel: 3,
      title: 'Other Team Artifact',
      labels: ['other-team'],
      capsules: [
        createMockCapsule({
          capsuleId: 'capsule_5',
          artifactId: 'artifact_5',
          situation: 'When working in other team',
          problem: 'Should not appear for this team',
          goal: 'Should not appear',
          labels: ['other-team'],
          scope: 'project',
          requiredLevel: 3,
        }),
      ],
    });
  });

  describe('isArtifactGovernanceEligible', () => {
    it('should return true for approved global artifact with low required level', () => {
      const filters = {
        teamId: teamId,
        securityLevel: 5,
        isSystemAdmin: false,
      };

      expect(isArtifactGovernanceEligible(approvedGlobalArtifact, filters)).toBe(true);
    });

    it('should return true for approved team artifact matching team and level', () => {
      const filters = {
        teamId: teamId,
        securityLevel: 5,
        isSystemAdmin: false,
      };

      expect(isArtifactGovernanceEligible(approvedTeamArtifact, filters)).toBe(true);
    });

    it('should return false for unapproved artifacts', () => {
      const filters = {
        teamId: teamId,
        securityLevel: 5,
        isSystemAdmin: false,
      };

      expect(isArtifactGovernanceEligible(unapprovedArtifact, filters)).toBe(false);
    });

    it('should return false for artifacts above user security level', () => {
      const filters = {
        teamId: teamId,
        securityLevel: 5,
        isSystemAdmin: false,
      };

      expect(isArtifactGovernanceEligible(highLevelArtifact, filters)).toBe(false);
    });

    it('should return false for project artifacts from other teams for non-admin', () => {
      const filters = {
        teamId: teamId,
        securityLevel: 5,
        isSystemAdmin: false,
      };

      expect(isArtifactGovernanceEligible(otherTeamArtifact, filters)).toBe(false);
    });

    it('should return true for any artifact when user is system admin', () => {
      const filters = {
        teamId: teamId,
        securityLevel: 5,
        isSystemAdmin: true,
      };

      expect(isArtifactGovernanceEligible(otherTeamArtifact, filters)).toBe(true);
      expect(isArtifactGovernanceEligible(highLevelArtifact, filters)).toBe(true);
    });
  });

  describe('buildProfileShortlist', () => {
    it('should only include approved, in-scope, within-level artifacts', () => {
      const artifacts = [
        approvedGlobalArtifact,
        approvedTeamArtifact,
        unapprovedArtifact,
        highLevelArtifact,
        otherTeamArtifact,
      ];

      const filters = {
        teamId: teamId,
        securityLevel: 5,
        isSystemAdmin: false,
      };

      const shortlist = buildProfileShortlist(artifacts, filters);

      // Should include global and matching team artifacts
      expect(shortlist.length).toBe(2);
      expect(shortlist.map((s) => s.artifact.id)).toContain('artifact_1');
      expect(shortlist.map((s) => s.artifact.id)).toContain('artifact_2');

      // Should NOT include unapproved, high-level, or other-team
      expect(shortlist.map((s) => s.artifact.id)).not.toContain('artifact_3');
      expect(shortlist.map((s) => s.artifact.id)).not.toContain('artifact_4');
      expect(shortlist.map((s) => s.artifact.id)).not.toContain('artifact_5');
    });
  });

  describe('extractGovernedCapsules', () => {
    it('should only extract capsules from governed artifacts', () => {
      const artifacts = [approvedGlobalArtifact, approvedTeamArtifact, unapprovedArtifact];

      const filters = {
        teamId: teamId,
        securityLevel: 5,
        isSystemAdmin: false,
      };

      const capsules = extractGovernedCapsules(artifacts, filters);

      // Should have 2 capsules from approved artifacts
      expect(capsules.length).toBe(2);
      expect(capsules.map((c) => c.capsule.capsuleId)).toContain('capsule_1');
      expect(capsules.map((c) => c.capsule.capsuleId)).toContain('capsule_2');
      expect(capsules.map((c) => c.capsule.capsuleId)).not.toContain('capsule_3');
    });
  });

  describe('rankCapsules', () => {
    it('should rank capsules based on parsed intent signals', () => {
      const artifacts = [approvedGlobalArtifact, approvedTeamArtifact];

      const intent: ParsedIntent = {
        seed: 'docker node version mismatch containers',
        normalized: 'docker node version mismatch containers',
        situation: 'When deploying containers with a Node.js application',
        problem: 'Container Node version older than development version',
        goal: 'Pin Node version in Dockerfile',
        errorText: null,
        tokens: [
          { token: 'docker', original: 'docker', isTechnical: true },
          { token: 'node', original: 'node', isTechnical: true },
          { token: 'version', original: 'version', isTechnical: false },
        ],
        stackPathHints: [
          { hint: 'docker', kind: 'stack', confidence: 0.9 },
          { hint: 'node', kind: 'stack', confidence: 0.9 },
        ],
        category: null,
        semanticQuery: null,
        parseMethod: 'regex',
      };

      const filters = {
        teamId: teamId,
        securityLevel: 5,
        isSystemAdmin: false,
      };

      const ranked = rankCapsules(artifacts, intent, filters, 10);

      expect(ranked.length).toBe(2);

      // First capsule should match docker/node intent better
      expect(ranked[0]?.artifactId).toBe('artifact_1');

      // Each candidate should have scores
      for (const candidate of ranked) {
        expect(candidate.finalScore).toBeGreaterThanOrEqual(0);
        expect(candidate.finalScore).toBeLessThanOrEqual(1);
        expect(candidate.reason.length).toBeGreaterThan(0);
      }
    });

    it('should apply stack/path boosts to capsule scores', () => {
      const artifacts = [approvedGlobalArtifact];

      // Intent with node hints (node is in the capsule content)
      const intent: ParsedIntent = {
        seed: 'node container deployment issue',
        normalized: 'node container deployment issue',
        situation: null,
        problem: 'node container deployment issue',
        goal: null,
        errorText: null,
        tokens: [
          { token: 'node', original: 'node', isTechnical: true },
          { token: 'container', original: 'container', isTechnical: true },
        ],
        stackPathHints: [{ hint: 'node', kind: 'stack', confidence: 0.9 }],
        category: null,
        semanticQuery: null,
        parseMethod: 'regex',
      };

      const filters = {
        teamId: teamId,
        securityLevel: 5,
        isSystemAdmin: false,
      };

      const ranked = rankCapsules(artifacts, intent, filters, 10);

      expect(ranked.length).toBe(1);
      // Stack boost should be > 1.0 since node is in capsule content
      expect(ranked[0]?.stackPathBoost).toBeGreaterThan(1.0);
    });

    it('should respect maxResults limit', () => {
      const artifacts = [approvedGlobalArtifact, approvedTeamArtifact];

      const intent: ParsedIntent = {
        seed: 'test query',
        normalized: 'test query',
        situation: null,
        problem: null,
        goal: null,
        errorText: null,
        tokens: [],
        stackPathHints: [],
        category: null,
        semanticQuery: null,
        parseMethod: 'regex',
      };

      const filters = {
        teamId: teamId,
        securityLevel: 5,
        isSystemAdmin: false,
      };

      const ranked = rankCapsules(artifacts, intent, filters, 1);

      expect(ranked.length).toBe(1);
    });
  });

  describe('getCapsuleRecords', () => {
    it('should return full capsule records for ranked candidates', () => {
      const artifacts = [approvedGlobalArtifact];

      const intent: ParsedIntent = {
        seed: 'docker node version',
        normalized: 'docker node version',
        situation: null,
        problem: 'version mismatch',
        goal: null,
        errorText: null,
        tokens: [],
        stackPathHints: [],
        category: null,
        semanticQuery: null,
        parseMethod: 'regex',
      };

      const filters = {
        teamId: teamId,
        securityLevel: 5,
        isSystemAdmin: false,
      };

      const ranked = rankCapsules(artifacts, intent, filters, 10);
      const records = getCapsuleRecords(artifacts, ranked);

      expect(records.length).toBe(ranked.length);

      for (const record of records) {
        expect(record.artifact).toBeDefined();
        expect(record.capsule).toBeDefined();
        expect(record.candidate).toBeDefined();
        expect(record.capsule.capsuleId).toBe(record.candidate.capsuleId);
      }
    });
  });

  describe('coexistence with legacy entries', () => {
    it('should not affect legacy retrieval when v2 capsule recall is used', () => {
      // This test verifies the v2 pipeline reads derived artifact outputs
      // without mutating the legacy path

      const artifacts = [approvedGlobalArtifact];

      const filters = {
        teamId: teamId,
        securityLevel: 5,
        isSystemAdmin: false,
      };

      // V2 capsule recall should work independently
      const capsules = extractGovernedCapsules(artifacts, filters);
      expect(capsules.length).toBe(1);

      // The artifact should remain unchanged
      expect(approvedGlobalArtifact.lifecycleState).toBe('approved');
      expect(approvedGlobalArtifact.latestRevision.derived?.capsules.length).toBe(1);
    });
  });

  describe('context-aware scoring (CAPS-04-CTX)', () => {
    let ctxArtifact: SkillArtifactRecord;
    let noCtxArtifact: SkillArtifactRecord;

    beforeEach(() => {
      ctxArtifact = createMockArtifact({
        id: 'artifact_ctx',
        teamId: null,
        scope: 'global',
        lifecycleState: 'approved',
        requiredLevel: 0,
        title: 'Docker Node Version Mismatch',
        labels: ['docker', 'node', 'version'],
        capsules: [
          createMockCapsule({
            capsuleId: 'capsule_ctx',
            artifactId: 'artifact_ctx',
            situation: 'When deploying containers with a Node.js application',
            problem: 'Container Node version older than development version',
            goal: 'Pin Node version in Dockerfile',
            labels: ['docker', 'node'],
            scope: 'global',
            requiredLevel: 0,
            contextualPrefix:
              'This is a Docker troubleshooting guide for Node.js container deployments, covering version mismatch issues between local and container environments.',
          }),
        ],
      });

      noCtxArtifact = createMockArtifact({
        id: 'artifact_no_ctx',
        teamId: null,
        scope: 'global',
        lifecycleState: 'approved',
        requiredLevel: 0,
        title: 'Docker Node Version Mismatch',
        labels: ['docker', 'node', 'version'],
        capsules: [
          createMockCapsule({
            capsuleId: 'capsule_no_ctx',
            artifactId: 'artifact_no_ctx',
            situation: 'When deploying containers with a Node.js application',
            problem: 'Container Node version older than development version',
            goal: 'Pin Node version in Dockerfile',
            labels: ['docker', 'node'],
            scope: 'global',
            requiredLevel: 0,
            // No contextualPrefix — backward compatibility
          }),
        ],
      });
    });

    it('should include contextScore in candidate output', () => {
      const artifacts = [ctxArtifact];
      const intent: ParsedIntent = {
        seed: 'docker container version',
        normalized: 'docker container version',
        situation: null,
        problem: 'docker container version',
        goal: null,
        errorText: null,
        tokens: [
          { token: 'docker', original: 'docker', isTechnical: true },
          { token: 'container', original: 'container', isTechnical: true },
        ],
        stackPathHints: [],
        category: null,
        semanticQuery: null,
        parseMethod: 'regex',
      };
      const filters = { teamId, securityLevel: 5, isSystemAdmin: false };

      const ranked = rankCapsules(artifacts, intent, filters, 10);

      expect(ranked.length).toBe(1);
      expect(ranked[0]?.contextScore).toBeGreaterThanOrEqual(0);
      expect(ranked[0]?.contextScore).toBeLessThanOrEqual(1);
    });

    it('should compute higher contextScore when contextualPrefix matches intent', () => {
      const artifacts = [ctxArtifact, noCtxArtifact];
      const intent: ParsedIntent = {
        seed: 'docker troubleshooting container deployment',
        normalized: 'docker troubleshooting container deployment',
        situation: null,
        problem: 'docker troubleshooting container deployment',
        goal: null,
        errorText: null,
        tokens: [
          { token: 'docker', original: 'docker', isTechnical: true },
          { token: 'troubleshooting', original: 'troubleshooting', isTechnical: false },
          { token: 'container', original: 'container', isTechnical: true },
        ],
        stackPathHints: [],
        category: null,
        semanticQuery: null,
        parseMethod: 'regex',
      };
      const filters = { teamId, securityLevel: 5, isSystemAdmin: false };

      const ranked = rankCapsules(artifacts, intent, filters, 10);

      const ctxCandidate = ranked.find((c) => c.capsuleId === 'capsule_ctx');
      const noCtxCandidate = ranked.find((c) => c.capsuleId === 'capsule_no_ctx');

      expect(ctxCandidate).toBeDefined();
      expect(noCtxCandidate).toBeDefined();

      // Capsule with contextualPrefix should have higher context score
      expect(ctxCandidate!.contextScore).toBeGreaterThan(noCtxCandidate!.contextScore);
    });

    it('should rank capsule with matching contextualPrefix higher overall', () => {
      const artifacts = [ctxArtifact, noCtxArtifact];
      // Intent that strongly matches the contextualPrefix content
      const intent: ParsedIntent = {
        seed: 'docker troubleshooting Node.js container deployment version mismatch environments',
        normalized:
          'docker troubleshooting node.js container deployment version mismatch environments',
        situation: null,
        problem:
          'docker troubleshooting Node.js container deployment version mismatch environments',
        goal: null,
        errorText: null,
        tokens: [
          { token: 'docker', original: 'docker', isTechnical: true },
          { token: 'troubleshooting', original: 'troubleshooting', isTechnical: false },
          { token: 'node.js', original: 'Node.js', isTechnical: true },
          { token: 'container', original: 'container', isTechnical: true },
          { token: 'deployment', original: 'deployment', isTechnical: false },
        ],
        stackPathHints: [],
        category: null,
        semanticQuery: null,
        parseMethod: 'regex',
      };
      const filters = { teamId, securityLevel: 5, isSystemAdmin: false };

      const ranked = rankCapsules(artifacts, intent, filters, 10);

      // Capsule with contextualPrefix should rank first
      expect(ranked[0]?.capsuleId).toBe('capsule_ctx');
      expect(ranked[0]?.contextScore).toBeGreaterThan(0);
    });

    it('should return contextScore = 0 when no contextualPrefix present', () => {
      const artifacts = [noCtxArtifact];
      const intent: ParsedIntent = {
        seed: 'docker node version',
        normalized: 'docker node version',
        situation: null,
        problem: 'docker node version',
        goal: null,
        errorText: null,
        tokens: [],
        stackPathHints: [],
        category: null,
        semanticQuery: null,
        parseMethod: 'regex',
      };
      const filters = { teamId, securityLevel: 5, isSystemAdmin: false };

      const ranked = rankCapsules(artifacts, intent, filters, 10);

      expect(ranked.length).toBe(1);
      expect(ranked[0]?.contextScore).toBe(0);
    });

    it('should include context match in reason when contextScore > 0.3', () => {
      const artifacts = [ctxArtifact];
      // Intent with many tokens matching the contextualPrefix
      const intent: ParsedIntent = {
        seed: 'docker troubleshooting guide Node.js container deployments version mismatch environments',
        normalized:
          'docker troubleshooting guide node.js container deployments version mismatch environments',
        situation: null,
        problem:
          'docker troubleshooting guide Node.js container deployments version mismatch environments',
        goal: null,
        errorText: null,
        tokens: [
          { token: 'docker', original: 'docker', isTechnical: true },
          { token: 'troubleshooting', original: 'troubleshooting', isTechnical: false },
          { token: 'container', original: 'container', isTechnical: true },
          { token: 'deployments', original: 'deployments', isTechnical: false },
          { token: 'version', original: 'version', isTechnical: false },
          { token: 'mismatch', original: 'mismatch', isTechnical: false },
          { token: 'environments', original: 'environments', isTechnical: false },
        ],
        stackPathHints: [],
        category: null,
        semanticQuery: null,
        parseMethod: 'regex',
      };
      const filters = { teamId, securityLevel: 5, isSystemAdmin: false };

      const ranked = rankCapsules(artifacts, intent, filters, 10);

      expect(ranked.length).toBe(1);
      // If contextScore > 0.3, reason should mention it
      if (ranked[0]!.contextScore > 0.3) {
        expect(ranked[0]!.reason).toContain('context match');
      }
    });

    it('should maintain backward compatibility with capsules without contextualPrefix', () => {
      // Mix of capsules with and without contextualPrefix
      const mixedArtifact = createMockArtifact({
        id: 'artifact_mixed',
        teamId: null,
        scope: 'global',
        lifecycleState: 'approved',
        requiredLevel: 0,
        title: 'Mixed Artifact',
        labels: ['mixed'],
        capsules: [
          createMockCapsule({
            capsuleId: 'capsule_with_ctx',
            artifactId: 'artifact_mixed',
            situation: 'When building APIs',
            problem: 'REST API authentication',
            goal: 'Implement OAuth2',
            labels: ['api', 'auth'],
            scope: 'global',
            requiredLevel: 0,
            contextualPrefix: 'Guide for API authentication using OAuth2 in REST services.',
          }),
          createMockCapsule({
            capsuleId: 'capsule_without_ctx',
            artifactId: 'artifact_mixed',
            situation: 'When building APIs',
            problem: 'REST API rate limiting',
            goal: 'Implement rate limiting',
            labels: ['api', 'rate-limit'],
            scope: 'global',
            requiredLevel: 0,
            // No contextualPrefix
          }),
        ],
      });

      const artifacts = [mixedArtifact];
      const intent: ParsedIntent = {
        seed: 'api authentication oauth2',
        normalized: 'api authentication oauth2',
        situation: null,
        problem: 'api authentication oauth2',
        goal: null,
        errorText: null,
        tokens: [
          { token: 'api', original: 'api', isTechnical: true },
          { token: 'authentication', original: 'authentication', isTechnical: true },
          { token: 'oauth2', original: 'oauth2', isTechnical: true },
        ],
        stackPathHints: [],
        category: null,
        semanticQuery: null,
        parseMethod: 'regex',
      };
      const filters = { teamId, securityLevel: 5, isSystemAdmin: false };

      const ranked = rankCapsules(artifacts, intent, filters, 10);

      // Should return both capsules without errors
      expect(ranked.length).toBe(2);

      const withCtx = ranked.find((c) => c.capsuleId === 'capsule_with_ctx');
      const withoutCtx = ranked.find((c) => c.capsuleId === 'capsule_without_ctx');

      expect(withCtx).toBeDefined();
      expect(withoutCtx).toBeDefined();

      // Capsule with contextualPrefix should have context score
      expect(withCtx!.contextScore).toBeGreaterThanOrEqual(0);
      // Capsule without contextualPrefix should have 0 context score
      expect(withoutCtx!.contextScore).toBe(0);
    });
  });
});
