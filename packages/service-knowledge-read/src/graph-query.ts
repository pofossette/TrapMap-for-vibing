import type {
  GraphIndexDocumentRecord,
  GraphIndexRepositoryPort,
  GraphQueryBackend,
  GraphQueryBackendHealth,
  GraphQueryExpansionView,
  GraphQueryNodeView,
  GraphQueryRuntimeState,
} from '@trapmap/contracts';
import type { GraphRuntimeSnapshot } from './graph-query-core.js';
import {
  buildLocalExpansionView as buildGraphologyLocalExpansionView,
  buildGraphRuntimeSnapshot,
  calculateSourceRelationStrength,
  expandSourcesOneHop,
} from './graph-query-core.js';

export class MemoryGraphQueryBackend implements GraphQueryBackend {
  // fallow-ignore-next-line unused-class-member -- GraphQueryBackend interface contract (contracts/src/domain/graph-query.ts); called via interface type from host-local shared-infra and package consumers
  readonly kind = 'memory' as const;

  /**
   * Runtime/documents cache: without it every backend method re-ran
   * `listAll()` (full table) and rebuilt the graphology projection — 3x per
   * graph-plan query and 1x per graph-recall CANDIDATE on the v1 graph
   * channel. Mutators invalidate; the TTL bounds staleness for writes that
   * bypass this backend instance (artifact derivation writes through the
   * knowledge-write bundle), matching the read-model cache precedent.
   */
  private static readonly RUNTIME_TTL_MS = Number(
    process.env.TRAPMAP_GRAPH_RUNTIME_TTL_MS ?? 60_000,
  );
  private runtimeCache: { snapshot: GraphRuntimeSnapshot; builtAt: number } | null = null;
  private documentsCache: { documents: GraphIndexDocumentRecord[]; builtAt: number } | null = null;

  constructor(private readonly graphIndexRepo: GraphIndexRepositoryPort) {}

  // fallow-ignore-next-line unused-class-member -- GraphQueryBackend interface contract (contracts/src/domain/graph-query.ts); called via interface type from host-local shared-infra and package consumers
  isEnabled(): boolean {
    return false;
  }

  // fallow-ignore-next-line unused-class-member -- GraphQueryBackend interface contract (contracts/src/domain/graph-query.ts); called via interface type from host-local shared-infra and package consumers
  getRuntimeState(): GraphQueryRuntimeState {
    return { mode: 'disabled', backendKind: 'memory', failOpen: false };
  }

  // fallow-ignore-next-line unused-class-member -- GraphQueryBackend interface contract (contracts/src/domain/graph-query.ts); called via interface type from host-local shared-infra and package consumers
  async healthcheck(): Promise<GraphQueryBackendHealth> {
    return { ok: true, mode: 'disabled' };
  }

  // fallow-ignore-next-line unused-class-member -- GraphQueryBackend interface contract (contracts/src/domain/graph-query.ts); called via interface type from host-local shared-infra and package consumers
  async upsertDocument(document: GraphIndexDocumentRecord): Promise<void> {
    await this.graphIndexRepo.upsert(document);
    this.invalidateRuntime();
  }

  // fallow-ignore-next-line unused-class-member -- GraphQueryBackend interface contract (contracts/src/domain/graph-query.ts); called via interface type from host-local shared-infra and package consumers
  async removeSource(sourceType: 'trap' | 'skill', sourceId: string): Promise<void> {
    await this.graphIndexRepo.removeBySource(sourceType, sourceId);
    this.invalidateRuntime();
  }

  // fallow-ignore-next-line unused-class-member -- GraphQueryBackend interface contract (contracts/src/domain/graph-query.ts); called via interface type from host-local shared-infra and package consumers
  async rebuildProjection(_documents: GraphIndexDocumentRecord[]): Promise<void> {
    // Memory mode already uses graphIndexRepo as the canonical store.
    this.invalidateRuntime();
  }

  // fallow-ignore-next-line unused-class-member -- GraphQueryBackend interface contract (contracts/src/domain/graph-query.ts); called via interface type from host-local shared-infra and package consumers
  async expandSourcesOneHop(params: {
    queryLabels: Set<string>;
    eligibleSourceIds?: Set<string>;
  }): Promise<Set<string>> {
    const expanded = expandSourcesOneHop(await this.loadRuntime(), params.queryLabels);
    if (!params.eligibleSourceIds) {
      return expanded;
    }
    return new Set([...expanded].filter((sourceId) => params.eligibleSourceIds?.has(sourceId)));
  }

  // fallow-ignore-next-line unused-class-member -- GraphQueryBackend interface contract (contracts/src/domain/graph-query.ts); called via interface type from host-local shared-infra and package consumers
  async calculateSourceRelationStrength(params: {
    sourceId: string;
    queryLabels: Set<string>;
  }): Promise<number> {
    return calculateSourceRelationStrength(
      await this.loadRuntime(),
      params.sourceId,
      params.queryLabels,
    );
  }

  // fallow-ignore-next-line unused-class-member -- GraphQueryBackend interface contract (contracts/src/domain/graph-query.ts); called via interface type from host-local shared-infra and package consumers
  async getSourceNodeIds(sourceIds: string[]): Promise<Map<string, Set<string>>> {
    const runtime = await this.loadRuntime();
    return new Map(
      sourceIds.map((sourceId) => [
        sourceId,
        new Set(runtime.nodeIdsBySourceId.get(sourceId) ?? []),
      ]),
    );
  }

  // fallow-ignore-next-line unused-class-member -- GraphQueryBackend interface contract (contracts/src/domain/graph-query.ts); called via interface type from host-local shared-infra and package consumers
  async buildLocalExpansionView(params: {
    seedNodeIds: string[];
    maxDepth: number;
    auth: { teamId: string | null; securityLevel: number };
  }): Promise<GraphQueryExpansionView> {
    const documents = await this.listDocuments();
    const graph = buildGraphologyLocalExpansionView({
      documents,
      seedNodeIds: params.seedNodeIds,
      maxDepth: params.maxDepth,
    });
    const nodeViewsById = new Map<string, GraphQueryNodeView>();
    const nodeIdsBySourceId = new Map<string, Set<string>>();

    for (const document of documents) {
      for (const node of document.nodes) {
        if (!graph.hasNode(node.id)) {
          continue;
        }
        const nodeView: GraphQueryNodeView = {
          sourceId: document.sourceId,
          sourceType: document.sourceType,
          teamId: document.teamId,
          scope: document.scope,
          requiredLevel: document.requiredLevel,
          documentEvidence: document.evidence,
          node,
        };
        const ownedByDocument = isCanonicalOwner(document, node);
        if (ownedByDocument || !nodeViewsById.has(node.id)) {
          nodeViewsById.set(node.id, nodeView);
        }
        if (ownedByDocument) {
          const nodeIds = nodeIdsBySourceId.get(document.sourceId) ?? new Set<string>();
          nodeIds.add(node.id);
          nodeIdsBySourceId.set(document.sourceId, nodeIds);
        }
      }
    }

    return { graph, nodeViewsById, nodeIdsBySourceId };
  }

  // fallow-ignore-next-line unused-class-member -- GraphQueryBackend interface contract (contracts/src/domain/graph-query.ts); called via interface type from host-local shared-infra and package consumers
  async findMitigatingSkills(trapNodeIds: string[]): Promise<string[]> {
    const runtime = await this.loadRuntime();
    const skills = new Set<string>();
    for (const trapNodeId of trapNodeIds) {
      for (const skillNodeId of runtime.mitigatingSkillNodeIdsByTrapNodeId.get(trapNodeId) ?? []) {
        skills.add(skillNodeId);
      }
    }
    return [...skills];
  }

  private async loadRuntime() {
    if (
      this.runtimeCache &&
      Date.now() - this.runtimeCache.builtAt < MemoryGraphQueryBackend.RUNTIME_TTL_MS
    ) {
      return this.runtimeCache.snapshot;
    }
    const snapshot = buildGraphRuntimeSnapshot(await this.listDocuments());
    this.runtimeCache = { snapshot, builtAt: Date.now() };
    return snapshot;
  }

  private async listDocuments(): Promise<GraphIndexDocumentRecord[]> {
    if (
      this.documentsCache &&
      Date.now() - this.documentsCache.builtAt < MemoryGraphQueryBackend.RUNTIME_TTL_MS
    ) {
      return this.documentsCache.documents;
    }
    const documents = await this.graphIndexRepo.listAll();
    this.documentsCache = { documents, builtAt: Date.now() };
    return documents;
  }

  private invalidateRuntime(): void {
    this.runtimeCache = null;
    this.documentsCache = null;
  }
}

export function createMemoryGraphQueryBackend(
  graphIndexRepo: GraphIndexRepositoryPort,
): MemoryGraphQueryBackend {
  return new MemoryGraphQueryBackend(graphIndexRepo);
}

function isCanonicalOwner(
  document: GraphIndexDocumentRecord,
  node: GraphQueryNodeView['node'],
): boolean {
  return (
    (node.kind === 'trap' &&
      document.sourceType === 'trap' &&
      node.id === `trap:${document.sourceId}`) ||
    (node.kind === 'skill' &&
      document.sourceType === 'skill' &&
      node.id === `skill:${document.sourceId}`)
  );
}
