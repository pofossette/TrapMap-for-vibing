/**
 * Shared graph fixtures for TrapMap retrieval tests.
 *
 * Provides factory functions (extracted from plan-compiler.test.ts) and
 * pre-built datasets for testing graph-skill orchestration at realistic scale.
 */

import { createRetrievalKnowledgeFixture, type Scope } from '@trapmap/contracts';

import type { ResolvedAuthContext, SkillShareerServices } from '@trapmap/server/lib/context.js';
import type {
  GraphEdgeRecord,
  GraphIndexDocumentRecord,
  GraphNodeRecord,
} from '@trapmap/server/lib/indexing/graph-lite/index.js';
import { AdapterRegistry } from '@trapmap/server/lib/indexing/registry.js';
import type { KnowledgeRecord, SkillArtifactRecord, StoreData } from '@trapmap/server/lib/store.js';

// ---------------------------------------------------------------------------
// Node builders
// ---------------------------------------------------------------------------

export function makeGraphNode(
  id: string,
  kind: GraphNodeRecord['kind'],
  label: string,
  evidence = 'test evidence',
): GraphNodeRecord {
  return { id, kind, label, evidence };
}

export function makeTrapNode(
  id: string,
  label: string,
  evidence = 'trap evidence',
): GraphNodeRecord {
  return { id: `trap:${id}`, kind: 'trap', label, evidence };
}

export function makeSkillNode(
  id: string,
  label: string,
  evidence = 'skill evidence',
): GraphNodeRecord {
  return { id: `skill:${id}`, kind: 'skill', label, evidence };
}

export function makeCueNode(id: string, label: string, evidence = 'cue evidence'): GraphNodeRecord {
  return { id: `cue:${id}`, kind: 'cue', label, evidence };
}

export function makePrerequisiteNode(
  id: string,
  label: string,
  evidence = 'prerequisite evidence',
): GraphNodeRecord {
  return { id: `prereq:${id}`, kind: 'prerequisite', label, evidence };
}

// ---------------------------------------------------------------------------
// Edge builders
// ---------------------------------------------------------------------------

export function makeEdge(
  id: string,
  sourceNodeId: string,
  targetNodeId: string,
  relationType: GraphEdgeRecord['relationType'],
  strength: GraphEdgeRecord['strength'] = 'hard',
  evidence = 'test evidence',
): GraphEdgeRecord {
  return { id, sourceNodeId, targetNodeId, relationType, strength, evidence };
}

export function makeMitigatesEdge(
  skillId: string,
  trapId: string,
  strength: 'hard' | 'soft' = 'hard',
): GraphEdgeRecord {
  return {
    id: `skill:${skillId}->trap:${trapId}:mitigates`,
    sourceNodeId: `skill:${skillId}`,
    targetNodeId: `trap:${trapId}`,
    relationType: 'mitigates',
    strength,
    evidence: 'mitigates evidence',
  };
}

export function makeRiskBlocksEdge(
  sourceId: string,
  targetId: string,
  strength: 'hard' | 'soft' = 'hard',
): GraphEdgeRecord {
  return {
    id: `trap:${sourceId}->cue:${targetId}:risk-blocks`,
    sourceNodeId: `trap:${sourceId}`,
    targetNodeId: `cue:${targetId}`,
    relationType: 'risk-blocks',
    strength,
    evidence: 'risk-blocks evidence',
  };
}

export function makeRequiresEdge(
  sourceId: string,
  targetId: string,
  strength: 'hard' | 'soft' = 'hard',
): GraphEdgeRecord {
  return {
    id: `skill:${sourceId}->skill:${targetId}:requires`,
    sourceNodeId: `skill:${sourceId}`,
    targetNodeId: `skill:${targetId}`,
    relationType: 'requires',
    strength,
    evidence: 'requires evidence',
  };
}

export function makeOrderEdge(sourceId: string, targetId: string): GraphEdgeRecord {
  return {
    id: `skill:${sourceId}->skill:${targetId}:order`,
    sourceNodeId: `skill:${sourceId}`,
    targetNodeId: `skill:${targetId}`,
    relationType: 'order',
    strength: 'soft',
    evidence: 'order evidence',
  };
}

export function makeAppliesInEdge(
  trapId: string,
  contextId: string,
  strength: 'hard' | 'soft' = 'soft',
): GraphEdgeRecord {
  return {
    id: `trap:${trapId}->boundary-context:${contextId}:applies-in`,
    sourceNodeId: `trap:${trapId}`,
    targetNodeId: `boundary-context:${contextId}`,
    relationType: 'applies-in',
    strength,
    evidence: 'applies-in evidence',
  };
}

export function makeCoOccursWithEdge(
  sourceId: string,
  targetId: string,
  strength: 'hard' | 'soft' = 'soft',
): GraphEdgeRecord {
  return {
    id: `skill:${sourceId}->skill:${targetId}:co-occurs-with`,
    sourceNodeId: `skill:${sourceId}`,
    targetNodeId: `skill:${targetId}`,
    relationType: 'co-occurs-with',
    strength,
    evidence: 'co-occurs evidence',
  };
}

export function makeRequiresVersionEdge(
  sourceId: string,
  versionId: string,
  strength: 'hard' | 'soft' = 'soft',
): GraphEdgeRecord {
  return {
    id: `trap:${sourceId}->boundary-version:${versionId}:requires-version`,
    sourceNodeId: `trap:${sourceId}`,
    targetNodeId: `boundary-version:${versionId}`,
    relationType: 'requires-version',
    strength,
    evidence: 'requires-version evidence',
  };
}

// ---------------------------------------------------------------------------
// Document / data builders
// ---------------------------------------------------------------------------

export function makeGraphDoc(
  sourceId: string,
  sourceType: 'trap' | 'skill',
  nodes: GraphNodeRecord[],
  edges: GraphEdgeRecord[],
  scope: 'global' | 'project' = 'global',
  requiredLevel = 0,
): GraphIndexDocumentRecord {
  return {
    id: `graphdoc_${sourceType}_${sourceId}_r1`,
    sourceType,
    sourceId,
    revision: 1,
    contentHash: `hash-${sourceId}`,
    teamId: null,
    scope,
    requiredLevel,
    nodes,
    edges,
    evidence: 'test evidence',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

export function makeKnowledgeEntry(
  id: string,
  options: { requiredLevel?: number; scope?: Scope; teamId?: string | null } = {},
): KnowledgeRecord {
  const { requiredLevel = 0, scope = 'global', teamId = null } = options;
  return createRetrievalKnowledgeFixture(id, {
    now: '2026-01-01T00:00:00Z',
    teamId,
    scope,
    shortcut: `Shortcut for ${id}`,
    detail: `Detail for ${id}`,
    requiredLevel,
  });
}

export function makeSkillArtifact(
  id: string,
  options: {
    requiredLevel?: number;
    scope?: Scope;
    teamId?: string | null;
    title?: string;
    withClientManifest?: boolean;
  } = {},
): SkillArtifactRecord {
  const {
    requiredLevel = 0,
    scope = 'global',
    teamId = null,
    title,
    withClientManifest = false,
  } = options;
  const fakeHash = 'a'.repeat(64);

  const clientManifest = withClientManifest
    ? {
        artifactId: id,
        revision: 1,
        sourceHash: fakeHash,
        references: [
          {
            path: 'references/cache-strategy.md',
            sha256: fakeHash,
            sizeBytes: 200,
            mediaType: 'text/markdown',
          },
        ],
        assets: [
          {
            path: 'assets/docker-compose.yml',
            sha256: fakeHash,
            sizeBytes: 500,
            mediaType: 'application/x-yaml',
          },
        ],
        scripts: [
          {
            path: 'scripts/deploy.sh',
            sha256: fakeHash,
            capability: 'deploy',
            argsSchemaSummary: 'No arguments',
            sideEffectSummary: 'Runs deployment script',
            defaultPolicy: 'needs-approval' as const,
          },
        ],
      }
    : null;

  return {
    id,
    teamId,
    scope,
    labels: ['test'],
    title: title ?? `Skill ${id}`,
    slug: `skill-${id}`,
    requiredLevel,
    lifecycleState: 'approved',
    ownerUserId: 'user_1',
    latestRevision: {
      revision: 1,
      sourceHash: fakeHash,
      files: [],
      submittedAt: '2026-01-01T00:00:00Z',
      submittedByUserId: 'user_1',
      scriptDescriptors: [],
      derived: {
        profile: {
          artifactId: id,
          revision: 1,
          sourceHash: fakeHash,
          title: title ?? `Skill ${id}`,
          summary: `Summary for ${id}`,
          keywords: ['test'],
          referencePaths: [],
          contentHash: fakeHash,
        },
        capsules: [
          {
            capsuleId: `capsule_${id}`,
            artifactId: id,
            revision: 1,
            sourcePaths: ['SKILL.md'],
            content: `Content for ${id}`,
            situation: `Situation for ${id}`,
            problem: `Problem for ${id}`,
            goal: `Goal for ${id}`,
            errorText: null,
            labels: ['test'],
            scope,
            requiredLevel,
          },
        ],
        clientManifest,
        sourceHash: fakeHash,
        derivedAt: '2026-01-01T00:00:00Z',
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
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

// ---------------------------------------------------------------------------
// Mock service builders
// ---------------------------------------------------------------------------

export function makeMockStoreData(data: Partial<StoreData> = {}): StoreData {
  return {
    counters: {},
    users: [],
    teams: [],
    memberships: [],
    accessKeys: [],
    sessions: [],
    knowledgeEntries: [],
    auditEvents: [],
    skillArtifacts: [],
    artifactFilePayloads: [],
    candidateSubmissions: [],
    duplicateCases: [],
    entityLineage: [],
    graphIndexDocuments: [],
    conflicts: [],
    feedbackQueue: [],
    promptVersion: null,
    rebuildState: null,
    ...data,
  };
}

export function makeMockServices(storeData: Partial<StoreData> = {}): SkillShareerServices {
  const data = makeMockStoreData(storeData);
  return {
    runtimeDeployment: {
      deploymentProfile: 'team-monolith',
      profileSource: 'explicit',
      preset: 'monolith',
      runtimeMode: 'combined',
      serviceUnit: 'full-platform',
      capabilities: {
        routeSurface: 'gateway-core',
        asyncOwnershipExpectation: 'local-owned',
        storagePosture: 'postgres-required',
        authTeamExpectation: 'team-auth',
        exposesGateway: true,
        exposesFullHttpApi: true,
        supportsLocalSingleUserMode: false,
        requiresPostgres: true,
        requiresGateway: true,
        requiresAsyncOwnership: false,
        allowsSingleProcess: true,
        ownsCandidateTaskWork: true,
        ownsSharedJobTaskWork: true,
        ownsOutboxWork: true,
        supportsReviewGovernance: true,
        supportsTeamAuth: true,
        supportsDistributedRouting: false,
      },
    },
    runtimeMode: 'combined',
    serviceUnit: 'full-platform',
    config: {} as SkillShareerServices['config'],
    store: {
      snapshot: async () => data,
      transact: async () => {},
      nextId: () => 'test_id',
    } as SkillShareerServices['store'],
    adapterRegistry: new AdapterRegistry(),
    channelRegistry: {} as any,
    strategyRegistry: {} as any,
    ai: {
      embeddings: {
        provider: 'fallback',
        isConfigured: false,
        embed: async () => new Array(384).fill(0),
      },
      chat: {
        provider: 'fallback',
        isConfigured: false,
        invoke: async () => '',
      },
    },
    knowledgeRepo: undefined,
    artifactRepo: undefined,
    sessionRepo: undefined,
    accessKeyRepo: undefined,
    userRepo: undefined,
    teamRepo: undefined,
    membershipRepo: undefined,
    usageAnalyticsRepo: undefined,
    repos: {
      graphIndex: {
        async listAll() {
          return data.graphIndexDocuments ?? [];
        },
      },
    } as SkillShareerServices['repos'],
    graphQueryBackend: {
      kind: 'memory',
      isEnabled: () => false,
      getRuntimeState: () => ({
        mode: 'disabled',
        backendKind: 'memory',
        failOpen: false,
      }),
      healthcheck: async () => ({ ok: true, mode: 'disabled' as const }),
      upsertDocument: async () => {},
      removeSource: async () => {},
      rebuildProjection: async () => {},
      expandSourcesOneHop: async () => new Set<string>(),
      calculateSourceRelationStrength: async () => 0,
      getSourceNodeIds: async () => new Map<string, Set<string>>(),
      buildLocalExpansionView: async () => ({
        graph: {} as any,
        nodeViewsById: new Map(),
        nodeIdsBySourceId: new Map(),
      }),
      findMitigatingSkills: async () => [],
    } as SkillShareerServices['graphQueryBackend'],
    graphQuery: {
      mode: 'disabled',
      backendKind: 'memory',
      failOpen: false,
    },
    eventBus: {
      on: () => ({}),
      emit: () => false,
      onDomainEvent: () => ({}),
      emitDomainEvent: () => {},
    } as unknown as import('@trapmap/server/lib/lifecycle/event-bus.js').LifecycleEventBus,
  };
}

export function makeMockAuth(overrides: Partial<ResolvedAuthContext> = {}): ResolvedAuthContext {
  return {
    subjectType: 'user',
    actorId: 'user_1',
    handle: 'testuser',
    activeTeamId: null,
    securityLevel: 10,
    effectivePermissions: [],
    user: null,
    membership: null,
    team: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Pre-built "Deploy Cluster" dataset (25+ nodes, 35+ edges)
// ---------------------------------------------------------------------------

export interface DeployClusterDataset {
  trapNodes: GraphNodeRecord[];
  skillNodes: GraphNodeRecord[];
  cueNodes: GraphNodeRecord[];
  prereqNodes: GraphNodeRecord[];
  allNodes: GraphNodeRecord[];
  edges: GraphEdgeRecord[];
  knowledgeEntries: KnowledgeRecord[];
  skillArtifacts: SkillArtifactRecord[];
  graphDocs: GraphIndexDocumentRecord[];
}

function buildGraphDocsForNodes(
  sourceNodes: GraphNodeRecord[],
  sourceType: 'trap' | 'skill',
  allNodes: GraphNodeRecord[],
  edges: GraphEdgeRecord[],
  governanceLevels: number[],
): GraphIndexDocumentRecord[] {
  return sourceNodes.map((sourceNode, index) => {
    const relatedEdges = edges.filter(
      (edge) => edge.sourceNodeId === sourceNode.id || edge.targetNodeId === sourceNode.id,
    );
    const relatedNodeIds = new Set([
      sourceNode.id,
      ...relatedEdges.flatMap((edge) => [edge.sourceNodeId, edge.targetNodeId]),
    ]);
    const nodesInDoc = allNodes.filter((node) => relatedNodeIds.has(node.id));

    return makeGraphDoc(
      sourceNode.id.replace(`${sourceType}:`, ''),
      sourceType,
      nodesInDoc,
      relatedEdges,
      'global',
      governanceLevels[index % governanceLevels.length] ?? 0,
    );
  });
}

/**
 * Build a realistic "Deploy Cluster" dataset with 25+ nodes and 35+ edges.
 * Covers 8 traps, 10 skills, 4 cues, 3 prerequisites.
 * Edges span all relation types and multiple governance levels.
 */
export function buildDeployClusterDataset(): DeployClusterDataset {
  // -- Trap nodes (8) --
  const trapNodes: GraphNodeRecord[] = [
    makeTrapNode(
      'mem-leak-rollback',
      'Memory leak during rollback',
      'OOM observed during rollback',
    ),
    makeTrapNode('db-migration-fail', 'Database migration failure', 'Migration v42 failed on prod'),
    makeTrapNode(
      'image-version-mismatch',
      'Container image version mismatch',
      'Image tag drifted between stages',
    ),
    makeTrapNode('missing-env-var', 'Missing environment variable', 'ENV VAR DB_URL not set'),
    makeTrapNode('ssl-cert-expired', 'SSL certificate expired', 'Cert expired mid-deploy'),
    makeTrapNode(
      'concurrent-deploy-race',
      'Concurrent deployment race condition',
      'Two deploys ran in parallel',
    ),
    makeTrapNode('k8s-resource-limit', 'K8s resource limit exceeded', 'Pod OOMKilled by limits'),
    makeTrapNode(
      'rollback-data-loss',
      'Rollback data loss',
      'Data written during deploy lost on rollback',
    ),
  ];

  // -- Skill nodes (10) --
  const skillNodes: GraphNodeRecord[] = [
    makeSkillNode('k8s-rolling-update', 'K8s rolling update strategy'),
    makeSkillNode('db-migration-safe', 'Database migration safety'),
    makeSkillNode('container-health-check', 'Container health check'),
    makeSkillNode('env-var-validation', 'Environment variable validation'),
    makeSkillNode('ssl-auto-renewal', 'SSL automatic renewal'),
    makeSkillNode('concurrent-deploy-lock', 'Concurrent deployment lock'),
    makeSkillNode('resource-monitoring', 'Resource monitoring and alerting'),
    makeSkillNode('blue-green-deploy', 'Blue-green deployment'),
    makeSkillNode('canary-release', 'Canary release'),
    makeSkillNode('db-backup-restore', 'Database backup and restore'),
  ];

  // -- Cue nodes (4) --
  const cueNodes: GraphNodeRecord[] = [
    makeCueNode('rollback-trigger', 'Rollback trigger detected'),
    makeCueNode('health-check-failed', 'Health check failure'),
    makeCueNode('deploy-timeout', 'Deployment timeout'),
    makeCueNode('data-integrity-risk', 'Data integrity risk'),
  ];

  // -- Prerequisite nodes (3) --
  const prereqNodes: GraphNodeRecord[] = [
    makePrerequisiteNode('k8s-access', 'Kubernetes cluster access'),
    makePrerequisiteNode('db-admin', 'Database admin access'),
    makePrerequisiteNode('registry-auth', 'Container registry authentication'),
  ];

  const allNodes = [...trapNodes, ...skillNodes, ...cueNodes, ...prereqNodes];

  // -- Edges (35+) --
  const edges: GraphEdgeRecord[] = [
    // 8 mitigates edges
    makeMitigatesEdge('k8s-rolling-update', 'mem-leak-rollback', 'hard'),
    makeMitigatesEdge('db-migration-safe', 'db-migration-fail', 'hard'),
    makeMitigatesEdge('container-health-check', 'image-version-mismatch', 'hard'),
    makeMitigatesEdge('env-var-validation', 'missing-env-var', 'hard'),
    makeMitigatesEdge('ssl-auto-renewal', 'ssl-cert-expired', 'hard'),
    makeMitigatesEdge('concurrent-deploy-lock', 'concurrent-deploy-race', 'hard'),
    makeMitigatesEdge('resource-monitoring', 'k8s-resource-limit', 'hard'),
    makeMitigatesEdge('db-backup-restore', 'rollback-data-loss', 'hard'),

    // 6 requires edges
    makeRequiresEdge('blue-green-deploy', 'k8s-rolling-update', 'hard'),
    makeRequiresEdge('canary-release', 'k8s-rolling-update', 'hard'),
    makeRequiresEdge('blue-green-deploy', 'db-migration-safe', 'soft'),
    makeRequiresEdge('canary-release', 'container-health-check', 'soft'),
    makeRequiresEdge('db-backup-restore', 'db-migration-safe', 'hard'),
    makeRequiresEdge('resource-monitoring', 'container-health-check', 'soft'),

    // 4 risk-blocks edges
    makeRiskBlocksEdge('mem-leak-rollback', 'rollback-trigger', 'hard'),
    makeRiskBlocksEdge('db-migration-fail', 'data-integrity-risk', 'hard'),
    makeRiskBlocksEdge('image-version-mismatch', 'health-check-failed', 'hard'),
    makeRiskBlocksEdge('concurrent-deploy-race', 'deploy-timeout', 'soft'),

    // 4 applies-in edges (trap -> context)
    makeAppliesInEdge('ssl-cert-expired', 'production'),
    makeAppliesInEdge('k8s-resource-limit', 'production'),
    makeAppliesInEdge('missing-env-var', 'staging'),
    makeAppliesInEdge('concurrent-deploy-race', 'production'),

    // 3 order edges
    makeOrderEdge('db-migration-safe', 'k8s-rolling-update'),
    makeOrderEdge('env-var-validation', 'container-health-check'),
    makeOrderEdge('ssl-auto-renewal', 'blue-green-deploy'),

    // 5 co-occurs-with edges
    makeCoOccursWithEdge('k8s-rolling-update', 'container-health-check'),
    makeCoOccursWithEdge('blue-green-deploy', 'canary-release'),
    makeCoOccursWithEdge('db-migration-safe', 'db-backup-restore'),
    makeCoOccursWithEdge('env-var-validation', 'ssl-auto-renewal'),
    makeCoOccursWithEdge('concurrent-deploy-lock', 'resource-monitoring'),

    // 5 requires-version edges
    makeRequiresVersionEdge('image-version-mismatch', 'k8s>=1.24'),
    makeRequiresVersionEdge('k8s-resource-limit', 'k8s>=1.25'),
    makeRequiresVersionEdge('ssl-cert-expired', 'cert-manager>=1.8'),
    makeRequiresVersionEdge('db-migration-fail', 'postgres>=14'),
    makeRequiresVersionEdge('mem-leak-rollback', 'docker>=20.10'),
  ];

  // -- Knowledge entries for each trap --
  const governanceLevels = [0, 3, 5, 8];
  const knowledgeEntries = trapNodes.map((node, i) => {
    const rawId = node.id.replace('trap:', '');
    return makeKnowledgeEntry(rawId, {
      requiredLevel: governanceLevels[i % governanceLevels.length] ?? 0,
    });
  });

  // -- Skill artifacts for each skill --
  const skillArtifacts = skillNodes.map((node, i) => {
    const rawId = node.id.replace('skill:', '');
    return makeSkillArtifact(rawId, {
      requiredLevel: governanceLevels[i % governanceLevels.length] ?? 0,
      title: node.label,
    });
  });

  // -- Graph documents: one per trap, one per skill --
  const graphDocs = [
    ...buildGraphDocsForNodes(trapNodes, 'trap', allNodes, edges, governanceLevels),
    ...buildGraphDocsForNodes(skillNodes, 'skill', allNodes, edges, governanceLevels),
  ];

  return {
    trapNodes,
    skillNodes,
    cueNodes,
    prereqNodes,
    allNodes,
    edges,
    knowledgeEntries,
    skillArtifacts,
    graphDocs,
  };
}

// ---------------------------------------------------------------------------
// Auxiliary datasets
// ---------------------------------------------------------------------------

/**
 * Disconnected components dataset: 2 connected components + 2 isolated nodes.
 */
export function buildDisconnectedDataset(): {
  docs: GraphIndexDocumentRecord[];
  isolatedNodeIds: string[];
  clusterANodeIds: string[];
  clusterBNodeIds: string[];
} {
  const clusterANodes = [
    makeTrapNode('cluster-a-trap', 'Cluster A Trap'),
    makeSkillNode('cluster-a-skill', 'Cluster A Skill'),
  ];
  const clusterBNodes = [
    makeTrapNode('cluster-b-trap', 'Cluster B Trap'),
    makeSkillNode('cluster-b-skill', 'Cluster B Skill'),
  ];
  const isolatedNodes = [
    makeTrapNode('isolated-trap', 'Isolated Trap'),
    makeSkillNode('isolated-skill', 'Isolated Skill'),
  ];

  const clusterAEdges = [makeMitigatesEdge('cluster-a-skill', 'cluster-a-trap')];
  const clusterBEdges = [makeMitigatesEdge('cluster-b-skill', 'cluster-b-trap')];

  const docs = [
    makeGraphDoc('cluster-a-trap', 'trap', clusterANodes, clusterAEdges),
    makeGraphDoc('cluster-b-trap', 'trap', clusterBNodes, clusterBEdges),
    makeGraphDoc('isolated-trap', 'trap', [isolatedNodes[0]!], []),
    makeGraphDoc('isolated-skill', 'skill', [isolatedNodes[1]!], []),
  ];

  return {
    docs,
    isolatedNodeIds: isolatedNodes.map((n) => n.id),
    clusterANodeIds: clusterANodes.map((n) => n.id),
    clusterBNodeIds: clusterBNodes.map((n) => n.id),
  };
}

/**
 * Cycle dataset: 3-node hard cycle + mixed strength cycle + diamond (no cycle).
 */
export function buildCycleDataset(): {
  hardCycleDoc: GraphIndexDocumentRecord;
  mixedCycleDoc: GraphIndexDocumentRecord;
  diamondDoc: GraphIndexDocumentRecord;
} {
  // 3-node hard cycle
  const hardCycleNodes = [
    makeSkillNode('hc-a', 'Hard Cycle A'),
    makeSkillNode('hc-b', 'Hard Cycle B'),
    makeSkillNode('hc-c', 'Hard Cycle C'),
  ];
  const hardCycleEdges = [
    makeRequiresEdge('hc-a', 'hc-b', 'hard'),
    makeRequiresEdge('hc-b', 'hc-c', 'hard'),
    makeRequiresEdge('hc-c', 'hc-a', 'hard'),
  ];

  // Mixed strength cycle (soft edges)
  const mixedCycleNodes = [
    makeSkillNode('mc-a', 'Mixed Cycle A'),
    makeSkillNode('mc-b', 'Mixed Cycle B'),
    makeSkillNode('mc-c', 'Mixed Cycle C'),
  ];
  const mixedCycleEdges = [
    makeRequiresEdge('mc-a', 'mc-b', 'hard'),
    makeRequiresEdge('mc-b', 'mc-c', 'hard'),
    makeRequiresEdge('mc-c', 'mc-a', 'soft'),
  ];

  // Diamond dependency (A -> B, A -> C, B -> D, C -> D) — no cycle
  const diamondNodes = [
    makeSkillNode('dm-a', 'Diamond A'),
    makeSkillNode('dm-b', 'Diamond B'),
    makeSkillNode('dm-c', 'Diamond C'),
    makeSkillNode('dm-d', 'Diamond D'),
  ];
  const diamondEdges = [
    makeRequiresEdge('dm-a', 'dm-b', 'hard'),
    makeRequiresEdge('dm-a', 'dm-c', 'hard'),
    makeRequiresEdge('dm-b', 'dm-d', 'hard'),
    makeRequiresEdge('dm-c', 'dm-d', 'hard'),
  ];

  return {
    hardCycleDoc: makeGraphDoc('hard-cycle', 'skill', hardCycleNodes, hardCycleEdges),
    mixedCycleDoc: makeGraphDoc('mixed-cycle', 'skill', mixedCycleNodes, mixedCycleEdges),
    diamondDoc: makeGraphDoc('diamond', 'skill', diamondNodes, diamondEdges),
  };
}
