import { describe, expect, it } from 'vitest';

import { createExperienceGeneFixture } from '@trapmap/backend-core/testing/index.js';
import type { ExperienceGeneSourceSnapshot } from '@trapmap/contracts';
import { experienceGeneDerivationTaskPayloadSchema } from '@trapmap/contracts';
import { experienceGeneSchema } from '@trapmap/contracts';
import { sha256CanonicalJson } from '@trapmap/lib';
import {
  type ExperienceGeneDerivationDependencies,
  deriveExperienceGeneFromRule,
} from './experience-gene-derivation.js';

const snapshot: ExperienceGeneSourceSnapshot = {
  kind: 'skill-artifact',
  sourceId: 'artifact-1:unit',
  revision: 4,
  sourceHash: 'a'.repeat(64),
  artifactId: 'artifact-1',
  artifactRevision: 4,
  derivationUnitId: 'unit',
  title: 'Queue ownership',
  labels: ['queue'],
  scope: 'project',
  teamId: null,
  requiredLevel: 1,
  text: [
    '## Match',
    '- retries fan out',
    '## Goal',
    'Give one worker ownership.',
    '## Strategy',
    '- Claim a lease before publishing.',
    '## Avoid',
    '- Publish from every retry.',
    '## Verify',
    '- Only one publisher succeeds.',
  ].join('\n'),
  truncated: false,
};

function taskPayload(overrides = {}) {
  const source = {
    kind: 'skill-artifact',
    sourceId: snapshot.sourceId,
    sourceRevision: snapshot.revision,
    sourceHash: snapshot.sourceHash,
    artifactId: snapshot.artifactId,
    capsuleId: null,
    artifactRevision: snapshot.artifactRevision,
  };
  return experienceGeneDerivationTaskPayloadSchema.parse({
    requestId: 'request-1',
    source,
    derivationUnitId: snapshot.derivationUnitId,
    generatorKind: 'rule',
    promptVersion: 'experience-gene-rule-v1',
    snapshotHash: sha256CanonicalJson(snapshot),
    ...overrides,
  });
}

function createDependencies() {
  const calls: string[] = [];
  const saved: unknown[] = [];
  const rejected: unknown[] = [];
  const gene = experienceGeneSchema.parse({
    ...createExperienceGeneFixture(),
    contentHash: 'b'.repeat(64),
  });
  const loaders = {
    async skillArtifact() {
      calls.push('load');
      return snapshot;
    },
  };
  const repository = {
    async saveCandidate(candidate: unknown) {
      calls.push('save');
      saved.push(candidate);
      return candidate;
    },
    async markValidated() {
      calls.push('validate');
      return gene;
    },
    async prepareProjections() {
      calls.push('prepare');
      return gene;
    },
    async solidify() {
      calls.push('solidify');
      return { ...gene, status: 'solidified' };
    },
    async markIndexStatus() {
      calls.push('index-failed');
      return gene;
    },
    async saveRejectedCandidate(event: unknown) {
      calls.push('reject');
      rejected.push(event);
    },
  };
  const dependenciesValue: ExperienceGeneDerivationDependencies = {
    loaders,
    repository,
    nowIso: '2026-08-26T00:00:00.000Z',
  };
  return { deps: dependenciesValue, calls, saved, rejected };
}

describe('rule-first experience gene derivation', () => {
  function createUnstructuredScenario() {
    const source = {
      ...snapshot,
      text: 'Queues sometimes fail and retries are tricky.',
      sourceHash: 'b'.repeat(64),
    };
    const state = createDependencies();
    state.deps.loaders = {
      ...state.deps.loaders,
      async skillArtifact() {
        state.calls.push('load');
        return source;
      },
    };
    const request = experienceGeneDerivationTaskPayloadSchema.parse({
      ...taskPayload(),
      source: { ...taskPayload().source, sourceHash: source.sourceHash },
      snapshotHash: sha256CanonicalJson(source),
    });
    return { ...state, request };
  }

  it('loads the immutable snapshot, saves a rule candidate, and marks it validated', async () => {
    const { deps, calls, saved } = createDependencies();
    const result = await deriveExperienceGeneFromRule(taskPayload(), deps);

    expect(result.status).toBe('solidified');
    expect(calls).toEqual(['load', 'save', 'validate', 'prepare', 'solidify']);
    expect(saved).toHaveLength(1);
  });

  it('keeps a validated Gene retryable when embedding generation fails', async () => {
    const { deps, calls } = createDependencies();
    deps.embedding = {
      version: 'provider-model-v1',
      async generate() {
        throw new Error('embedding unavailable');
      },
    };
    const result = await deriveExperienceGeneFromRule(taskPayload(), deps);

    expect(result.status).toBe('validated');
    expect(calls).toEqual(['load', 'save', 'validate', 'index-failed']);
  });

  it('ends a stale-source task without writing aggregate or rejection events', async () => {
    const { deps, calls, saved, rejected } = createDependencies();
    const result = await deriveExperienceGeneFromRule(
      taskPayload({ snapshotHash: 'b'.repeat(64) }),
      deps,
    );

    expect(result.status).toBe('stale-source');
    expect(calls).toEqual(['load']);
    expect(saved).toEqual([]);
    expect(rejected).toEqual([]);
  });

  it('stores a rejected event when the source has no derivable strategy', async () => {
    const { deps, rejected, calls, saved, request } = createUnstructuredScenario();
    const result = await deriveExperienceGeneFromRule(request, deps);

    expect(result.status).toBe('rejected');
    expect(rejected[0]).toMatchObject({ type: 'rejected', reasonClass: 'generator-unavailable' });
    expect(saved).toEqual([]);
    expect(calls).toEqual(['load', 'reject']);
  });

  it('uses the configured LLM fallback only after rule extraction is insufficient', async () => {
    const { deps, calls, saved, request } = createUnstructuredScenario();
    let llmCalls = 0;
    const source = experienceGeneSchema.parse({
      ...createExperienceGeneFixture(),
      contentHash: 'c'.repeat(64),
    });
    deps.llm = {
      async extract() {
        llmCalls += 1;
        return source;
      },
    };
    const result = await deriveExperienceGeneFromRule(request, deps);

    expect(result.status).toBe('solidified');
    expect(llmCalls).toBe(1);
    expect(calls).toEqual(['load', 'save', 'validate', 'prepare', 'solidify']);
    expect(saved[0]).toBe(source);
  });
});
