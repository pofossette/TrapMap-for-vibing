import type { RouteDef } from '@trapmap/backend-core';
import { createCandidateIngestionRouteDefs } from '@trapmap/service-candidate-ingestion';
import {
  type GovernanceReviewRouteDeps,
  createGovernanceReviewRouteDefs,
} from '@trapmap/service-governance-review';
import { createIdentityAccessRouteDefs } from '@trapmap/service-identity-access';
import { createJobRuntimeRouteDefs } from '@trapmap/service-job-runtime';
import { createKnowledgeReadRouteDefs } from '@trapmap/service-knowledge-read';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { serviceRouteDefsForMonolith } from './monolith-route-defs.js';

const emptyRecord = z.record(z.string(), z.unknown());

function routeDefsForEveryServiceModule(): Array<{ name: string; routeDefs: RouteDef[] }> {
  const identityPort = {
    login: vi.fn(),
    loginSystemAdmin: vi.fn(),
    logout: vi.fn(),
    validateSession: vi.fn(),
    selectTeam: vi.fn(),
    createTeam: vi.fn(),
    listTeams: vi.fn(),
    addMember: vi.fn(),
    updateMember: vi.fn(),
    provisionAccessKey: vi.fn(),
  };
  const knowledgeReadPort = {
    getById: vi.fn(),
    listMine: vi.fn(),
    search: vi.fn(),
    getProjectionStatus: vi.fn(),
  };
  const jobRuntimePort = { schedule: vi.fn(), getStatus: vi.fn(), getQueueStatus: vi.fn() };
  const candidatePort = {
    submit: vi.fn(),
    getById: vi.fn(),
    listByStatus: vi.fn(),
    applyResolution: vi.fn(),
    submitManualResult: vi.fn(),
    publishCandidateResult: vi.fn(),
  };
  const governanceReviewDeps: GovernanceReviewRouteDeps = {
    approve: vi.fn(),
    reject: vi.fn(),
    applyMaintenance: vi.fn(),
    applyDecay: vi.fn(),
    reviewArtifact: vi.fn(),
    submitFeedback: vi.fn(),
  };
  return [
    { name: 'identity-access', routeDefs: createIdentityAccessRouteDefs(identityPort) },
    { name: 'knowledge-read', routeDefs: createKnowledgeReadRouteDefs(knowledgeReadPort) },
    { name: 'job-runtime', routeDefs: createJobRuntimeRouteDefs(jobRuntimePort) },
    { name: 'candidate-ingestion', routeDefs: createCandidateIngestionRouteDefs(candidatePort) },
    { name: 'governance-review', routeDefs: createGovernanceReviewRouteDefs(governanceReviewDeps) },
  ];
}

describe('serviceRouteDefsForMonolith', () => {
  it('filters every /internal/* path out of every mounted service RouteDef list', () => {
    const modules = routeDefsForEveryServiceModule();
    expect(modules.flatMap((module) => module.routeDefs.map((route) => route.path))).toContainEqual(
      expect.stringMatching(/^\/internal\//),
    );

    for (const module of modules) {
      const filtered = serviceRouteDefsForMonolith(module.routeDefs);
      for (const route of filtered) {
        expect(route.path, `${module.name} keeps ${route.path}`).not.toMatch(/^\/internal\//);
      }
    }
  });

  it('keeps only the credential login routes from the identity-access surface', () => {
    const identity = routeDefsForEveryServiceModule().find(
      (module) => module.name === 'identity-access',
    );
    expect(identity).toBeDefined();

    const filtered = serviceRouteDefsForMonolith(identity.routeDefs, {
      allowInternalPaths: new Set(['/internal/auth/login', '/internal/auth/system-admin-login']),
    });

    expect(filtered.map((route) => route.path).sort()).toEqual([
      '/internal/auth/login',
      '/internal/auth/system-admin-login',
    ]);
  });

  it('preserves non-internal paths when no allowlist is given', () => {
    const routeDefs: RouteDef[] = [
      {
        method: 'GET',
        path: '/v1/knowledge/mine',
        schema: z.object({
          params: emptyRecord,
          query: emptyRecord,
          body: z.unknown(),
        }),
        handler: vi.fn(async () => undefined),
      },
    ];
    const filtered = serviceRouteDefsForMonolith(routeDefs);
    expect(filtered.map((route) => route.path)).toEqual(['/v1/knowledge/mine']);
  });
});
