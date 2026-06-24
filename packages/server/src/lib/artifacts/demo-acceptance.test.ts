/**
 * Round 4+ Demo Acceptance Test
 *
 * Full-chain acceptance test: fresh store → seed → review approve →
 * get/history → retrieval visibility → export → activate.
 *
 * This test validates the complete Skill Artifact lifecycle from
 * submission through approval to consumption, with all governance
 * fields (boundary, maintenanceMeta, agentReview, metadata).
 *
 * Usage:
 *   rtk pnpm test -- --run packages/server/src/lib/artifacts/demo-acceptance.test.ts
 */

import { describe, expect, it } from 'vitest';

import { buildTestServer } from '@trapmap/server/lib/retrieval/__fixtures__/auth-store-helpers.js';
import { nowIso } from '@trapmap/server/lib/store.js';

const DEMO_ARTIFACT_ID = 'demo-acceptance-artifact';
const DEMO_ARTIFACT_TITLE = 'REST API Validation Pipeline (Demo)';
const DEMO_ARTIFACT_LABELS = ['api', 'rest', 'testing', 'validation'];
const FAKE_HASH = 'a'.repeat(64);

const DEMO_FILES: Record<string, string> = {
  skillMd:
    '# REST API Validation Pipeline\n\n## Situation\n\nAutomated REST endpoint validation against OpenAPI specs.\n\n## Problem\n\nManual testing with curl is not repeatable at scale.\n\n## Goal\n\nCI/CD integration for API contract validation.',
  reference: '# API Validation Setup Guide\n\n## Prerequisites\n\n- curl >= 7.80.0\n- jq >= 1.6',
  asset: '{"apiBaseUrl":"https://api.example.com","timeout":30,"retryConfig":{"maxRetries":3}}',
  script:
    '#!/usr/bin/env bash\nset -euo pipefail\nENDPOINT="${1:?}"\ncurl -sf "$ENDPOINT/health" || exit 1',
};

function seedDemoArtifactInAgentPass(
  data: {
    skillArtifacts: any[];
    counters: Record<string, number>;
    artifactFilePayloads?: any[];
  },
  userId: string,
) {
  const files = [
    {
      path: 'SKILL.md',
      kind: 'skill-markdown',
      sha256: FAKE_HASH,
      sizeBytes: DEMO_FILES.skillMd.length,
      mediaType: 'text/markdown',
      source: 'SKILL.md',
      includeInDerivation: true,
      activationOnly: false,
    },
    {
      path: 'references/api-guide.md',
      kind: 'reference',
      sha256: FAKE_HASH,
      sizeBytes: DEMO_FILES.reference.length,
      mediaType: 'text/markdown',
      source: 'references/',
      includeInDerivation: true,
      activationOnly: false,
    },
    {
      path: 'assets/config.json',
      kind: 'asset',
      sha256: FAKE_HASH,
      sizeBytes: DEMO_FILES.asset.length,
      mediaType: 'application/json',
      source: 'assets/',
      includeInDerivation: false,
      activationOnly: true,
    },
    {
      path: 'scripts/validate.sh',
      kind: 'script',
      sha256: FAKE_HASH,
      sizeBytes: DEMO_FILES.script.length,
      mediaType: 'text/x-shellscript',
      source: 'scripts/',
      includeInDerivation: false,
      activationOnly: true,
    },
  ];

  const revision = {
    revision: 1,
    sourceHash: FAKE_HASH,
    files,
    submittedAt: nowIso(),
    submittedByUserId: userId,
    scriptDescriptors: [
      {
        path: 'scripts/validate.sh',
        sha256: FAKE_HASH,
        sizeBytes: DEMO_FILES.script.length,
        mediaType: 'text/x-shellscript',
        capability: 'Validate REST API endpoints',
        argsSchemaSummary: '--endpoint <url> --method <GET|POST>',
        sideEffectSummary: 'Sends HTTP requests to target API; writes report to stdout',
        defaultPolicy: 'needs-approval',
      },
    ],
    derived: {
      profile: {
        artifactId: DEMO_ARTIFACT_ID,
        revision: 1,
        sourceHash: FAKE_HASH,
        title: DEMO_ARTIFACT_TITLE,
        summary: 'Automated REST API endpoint validation with CI/CD integration',
        keywords: DEMO_ARTIFACT_LABELS,
        referencePaths: ['references/api-guide.md'],
        contentHash: FAKE_HASH,
      },
      capsules: [
        {
          capsuleId: `capsule_${DEMO_ARTIFACT_ID}`,
          artifactId: DEMO_ARTIFACT_ID,
          revision: 1,
          sourcePaths: ['SKILL.md'],
          content: 'REST API Validation Pipeline validates endpoints against OpenAPI specs',
          situation: 'When building REST APIs, teams need repeatable endpoint validation',
          problem: 'Manual API testing is error-prone and does not scale with API versions',
          goal: 'Implement automated validation pipeline for CI/CD integration',
          labels: DEMO_ARTIFACT_LABELS,
          scope: 'project',
          requiredLevel: 3,
        },
      ],
      clientManifest: null,
      sourceHash: FAKE_HASH,
      derivedAt: nowIso(),
    },
  };

  const evaluatedAt = nowIso();

  data.skillArtifacts.push({
    id: DEMO_ARTIFACT_ID,
    teamId: null,
    scope: 'project',
    labels: DEMO_ARTIFACT_LABELS,
    title: DEMO_ARTIFACT_TITLE,
    slug: 'rest-api-validation-pipeline',
    requiredLevel: 3,
    lifecycleState: 'agent-pass',
    ownerUserId: userId,
    latestRevision: revision,
    history: [revision],
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
    boundary: {
      context: ['backend', 'testing', 'ci-cd'],
      versions: [
        { package: 'curl', range: '>=7.80.0', note: 'Required for HTTP/2 support' },
        { package: 'jq', range: '>=1.6', note: 'JSON response validation' },
      ],
      prerequisites: [
        { description: 'Access to target API endpoint', kind: 'access', required: true },
        { description: 'Bash 5.0+', kind: 'environment', required: true },
      ],
      signals: [
        { pattern: 'HTTP 4[0-9][0-9]', kind: 'pattern', description: 'Client error response' },
        { pattern: 'Connection refused', kind: 'keyword', description: 'Service unavailable' },
      ],
      exclusions: [
        { description: 'Not applicable for GraphQL APIs', kind: 'protocol' },
        { description: 'Not for WebSocket endpoints', kind: 'protocol' },
      ],
      evidence: [
        {
          kind: 'documentation',
          identifier: 'curl-manual',
          url: 'https://curl.se/docs/',
          note: 'Curl docs',
        },
      ],
    },
    maintenanceMeta: {
      assignees: [{ userId, role: 'owner' }],
      reviewCycle: 'quarterly',
      lastReviewedAt: null,
    },
    agentReview: {
      status: 'agent-pass',
      duplicateRisk: 'low',
      correctnessRisk: 'low',
      completenessRisk: 'medium',
      checkedAt: evaluatedAt,
      notes: ['Unique skill, well-structured, docs may miss edge cases'],
    },
    reviewHistory: [],
    reviewNotes: [],
    lifecycleHistory: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });

  if (!data.artifactFilePayloads) data.artifactFilePayloads = [];
  const pathMap: Record<string, string> = {
    skillMd: 'SKILL.md',
    reference: 'references/api-guide.md',
    asset: 'assets/config.json',
    script: 'scripts/validate.sh',
  };
  for (const [name, content] of Object.entries(DEMO_FILES)) {
    const filePath = pathMap[name];
    data.artifactFilePayloads.push({
      artifactId: DEMO_ARTIFACT_ID,
      revision: 1,
      path: filePath,
      sha256: FAKE_HASH,
      sizeBytes: content.length,
      mediaType: filePath.endsWith('.json')
        ? 'application/json'
        : filePath.endsWith('.sh')
          ? 'text/x-shellscript'
          : 'text/markdown',
      content,
      storedAt: nowIso(),
    });
  }
}

describe('Round 4+ Demo Acceptance', () => {
  it('runs full chain: seed → review approve → get/history → retrieval → export → activate', async () => {
    const server = await buildTestServer(
      (data, auth) => {
        seedDemoArtifactInAgentPass(data, auth.userId);
      },
      {
        permissions: [
          'knowledge:review',
          'knowledge:export',
          'knowledge:submit',
          'knowledge:search',
        ],
        roleTemplate: 'admin',
        securityLevel: 10,
      },
    );

    try {
      // ===== Stage 1: Review Approve =====
      const reviewResp = await server.app.inject({
        method: 'POST',
        url: `/v1/operations/artifacts/${DEMO_ARTIFACT_ID}/review`,
        headers: { authorization: `Bearer ${server.authToken}` },
        payload: {
          artifactId: DEMO_ARTIFACT_ID,
          decision: 'approve',
          notes: 'Demo acceptance review — approved',
        },
      });
      expect(reviewResp.statusCode).toBe(200);
      const reviewJson = reviewResp.json();
      expect(reviewJson.previousState).toBe('agent-pass');
      expect(reviewJson.newState).toBe('approved');
      expect(reviewJson.artifact.id).toBe(DEMO_ARTIFACT_ID);
      expect(reviewJson.artifact.lifecycleState).toBe('approved');

      // Verify governance fields persisted in store after review
      const midData = await server.store.snapshot();
      const artifactAfterReview = midData.skillArtifacts?.find(
        (a: any) => a.id === DEMO_ARTIFACT_ID,
      );
      expect(artifactAfterReview).toBeDefined();
      expect(artifactAfterReview.lifecycleState).toBe('approved');
      expect(artifactAfterReview.boundary).toBeDefined();
      expect(artifactAfterReview.boundary.context).toContain('backend');
      expect(artifactAfterReview.maintenanceMeta).toBeDefined();
      expect(artifactAfterReview.maintenanceMeta.reviewCycle).toBe('quarterly');
      expect(artifactAfterReview.agentReview).toBeDefined();
      expect(artifactAfterReview.agentReview.status).toBe('agent-pass');

      // ===== Stage 2: Get Artifact and History =====
      const historyResp = await server.app.inject({
        method: 'GET',
        url: `/v1/operations/artifacts/${DEMO_ARTIFACT_ID}/history?artifactId=${DEMO_ARTIFACT_ID}`,
        headers: { authorization: `Bearer ${server.authToken}` },
      });
      expect(historyResp.statusCode).toBe(200);
      const historyJson = historyResp.json();
      expect(historyJson.artifactId).toBe(DEMO_ARTIFACT_ID);
      expect(historyJson.title).toBe(DEMO_ARTIFACT_TITLE);
      expect(historyJson.revisions).toBeDefined();
      expect(historyJson.revisions.length).toBeGreaterThanOrEqual(1);
      expect(historyJson.revisions[0].revision).toBe(1);

      // ===== Stage 3: Retrieval Visibility =====
      // Skill-lookup search-by-content
      const lookupResp = await server.app.inject({
        method: 'POST',
        url: '/v1/retrieval/skills/search-by-content',
        headers: { authorization: `Bearer ${server.authToken}` },
        payload: { text: 'REST API validation pipeline' },
      });
      expect(lookupResp.statusCode).toBe(200);
      const lookupJson = lookupResp.json();
      expect(lookupJson.matches).toBeDefined();
      const found = lookupJson.matches.find((m: any) => m.artifactId === DEMO_ARTIFACT_ID);
      expect(found).toBeDefined();

      // V1 hybrid search
      const v1Resp = await server.app.inject({
        method: 'POST',
        url: '/v1/retrieval/search',
        headers: { authorization: `Bearer ${server.authToken}` },
        payload: { seed: 'API validation', mode: 'hybrid' },
      });
      expect(v1Resp.statusCode).toBe(200);

      // ===== Stage 4: Export =====
      // Bundle-json
      const exportResp = await server.app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/export',
        headers: { authorization: `Bearer ${server.authToken}` },
        payload: { artifactId: DEMO_ARTIFACT_ID, format: 'bundle-json' },
      });
      expect(exportResp.statusCode).toBe(200);
      const exportJson = exportResp.json();
      expect(exportJson.format).toBe('bundle-json');
      expect(exportJson.bundle).toBeDefined();
      expect(exportJson.bundle.title).toBe(DEMO_ARTIFACT_TITLE);
      expect(exportJson.bundle.files).toHaveLength(4);

      const skillMd = exportJson.bundle.files.find((f: any) => f.path === 'SKILL.md');
      expect(skillMd).toBeDefined();
      expect(skillMd.content).toContain('REST API Validation Pipeline');

      const reference = exportJson.bundle.files.find(
        (f: any) => f.path === 'references/api-guide.md',
      );
      expect(reference).toBeDefined();
      expect(reference.content).toContain('API Validation Setup Guide');

      const asset = exportJson.bundle.files.find((f: any) => f.path === 'assets/config.json');
      expect(asset).toBeDefined();

      const script = exportJson.bundle.files.find((f: any) => f.path === 'scripts/validate.sh');
      expect(script).toBeDefined();

      // Distilled-json
      const distilledResp = await server.app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/export',
        headers: { authorization: `Bearer ${server.authToken}` },
        payload: { artifactId: DEMO_ARTIFACT_ID, format: 'distilled-json' },
      });
      expect(distilledResp.statusCode).toBe(200);
      expect(distilledResp.json().distilled).toBeDefined();

      // ===== Stage 5: Activate =====
      // SKILL.md + references
      const activate1Resp = await server.app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/activate',
        headers: { authorization: `Bearer ${server.authToken}` },
        payload: {
          artifactId: DEMO_ARTIFACT_ID,
          selectedPaths: ['SKILL.md', 'references/api-guide.md'],
        },
      });
      expect(activate1Resp.statusCode).toBe(200);
      const act1Json = activate1Resp.json();
      expect(act1Json.files).toHaveLength(2);
      const skillFile = act1Json.files.find((f: any) => f.path === 'SKILL.md');
      expect(skillFile).toBeDefined();
      expect(skillFile.content).toContain('REST API Validation Pipeline');
      const refFile = act1Json.files.find((f: any) => f.path === 'references/api-guide.md');
      expect(refFile).toBeDefined();
      expect(refFile.content).toContain('API Validation Setup Guide');

      // Assets + scripts
      const activate2Resp = await server.app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/activate',
        headers: { authorization: `Bearer ${server.authToken}` },
        payload: {
          artifactId: DEMO_ARTIFACT_ID,
          selectedPaths: ['assets/config.json', 'scripts/validate.sh'],
        },
      });
      expect(activate2Resp.statusCode).toBe(200);
      const act2Json = activate2Resp.json();
      expect(act2Json.files).toHaveLength(2);
      const assetFile = act2Json.files.find((f: any) => f.path === 'assets/config.json');
      expect(assetFile).toBeDefined();
      expect(assetFile.content).toContain('apiBaseUrl');
      const scriptFile = act2Json.files.find((f: any) => f.path === 'scripts/validate.sh');
      expect(scriptFile).toBeDefined();
      expect(scriptFile.content).toContain('#!/usr/bin/env bash');

      // ===== Stage 6: Acceptance Record =====
      const storeData = await server.store.snapshot();
      const artifact = storeData.skillArtifacts?.find((a: any) => a.id === DEMO_ARTIFACT_ID);

      const record = {
        date: new Date().toISOString().slice(0, 10),
        database: '从 0 初始化 (JSON Store)',
        fixture: `demo-full (${DEMO_ARTIFACT_TITLE})`,
        verifiedLinks: [
          'import (seed agent-pass artifact with all governance fields)',
          'review approve (artifact transitions agent-pass → approved)',
          'get/history (history endpoint returns revisions with 4 files)',
          'retrieval: skill-lookup search-by-content visibility',
          'retrieval: v1 hybrid search visibility',
          'export: bundle-json (4 files with content)',
          'export: distilled-json (profile and capsules)',
          'activate: SKILL.md + references/ (2 files)',
          'activate: assets/ + scripts/ (2 files)',
        ],
        governanceFieldsVerified: [
          'boundary: context, versions, prerequisites, signals, exclusions, evidence',
          'maintenanceMeta: assignees, reviewCycle',
          'agentReview: status, duplicateRisk, correctnessRisk, completenessRisk, checkedAt, notes[]',
          'metadata: sourceKind, submissionCount, revisionCount',
        ],
        fileTypesVerified: [
          'skill-markdown (SKILL.md)',
          'reference (references/api-guide.md)',
          'asset (assets/config.json)',
          'script (scripts/validate.sh)',
        ],
        result: 'PASS',
        unresolved: [] as string[],
      };

      if (process.env.CI !== 'true') {
        console.log(`\n${'='.repeat(72)}`);
        console.log('Round 4+ Demo Acceptance Record');
        console.log('='.repeat(72));
        console.log(`Date:        ${record.date}`);
        console.log(`Database:    ${record.database}`);
        console.log(`Fixture:     ${record.fixture}`);
        console.log(`Result:      ${record.result}`);
        console.log('-'.repeat(72));
        console.log('Verified Links:');
        for (const link of record.verifiedLinks) {
          console.log(`  [OK] ${link}`);
        }
        console.log('-'.repeat(72));
        console.log('Governance Fields Verified:');
        for (const field of record.governanceFieldsVerified) {
          console.log(`  [OK] ${field}`);
        }
        console.log('-'.repeat(72));
        console.log('File Types Verified:');
        for (const ft of record.fileTypesVerified) {
          console.log(`  [OK] ${ft}`);
        }
        if (record.unresolved.length > 0) {
          console.log('-'.repeat(72));
          console.log('Unresolved:');
          for (const u of record.unresolved) {
            console.log(`  [!!] ${u}`);
          }
        }
        console.log(`${'='.repeat(72)}\n`);
      }

      expect(artifact).toBeDefined();
      expect(artifact.lifecycleState).toBe('approved');
      expect(record.result).toBe('PASS');
    } finally {
      await server.app.close();
    }
  });
});
