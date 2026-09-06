import type {
  GraphIndexDocumentRecord,
  GraphIndexRepositoryPort,
  GraphQueryBackend,
  GraphQueryBackendHealth,
  GraphQueryExpansionView,
  GraphQueryNodeView,
  GraphQueryRuntimeState,
} from '@trapmap/contracts';
import {
  buildLocalExpansionView as buildGraphologyLocalExpansionView,
  buildGraphRuntimeSnapshot,
  calculateSourceRelationStrength,
  expandSourcesOneHop,
} from './graph-query-core.js';

export class MemoryGraphQueryBackend implements GraphQueryBackend {
  // fallow-ignore-next-line unused-class-member -- GraphQueryBackend interface contract (contracts/src/domain/graph-query.ts); called via interface type from host-local shared-infra and package consumers
  readonly kind = 'memory' as const;

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
  }

  // fallow-ignore-next-line unused-class-member -- GraphQueryBackend interface contract (contracts/src/domain/graph-query.ts); called via interface type from host-local shared-infra and package consumers
  async removeSource(sourceType: 'trap' | 'skill', sourceId: string): Promise<void> {
    await this.graphIndexRepo.removeBySource(sourceType, sourceId);
  }

  // fallow-ignore-next-line unused-class-member -- GraphQueryBackend interface contract (contracts/src/domain/graph-query.ts); called via interface type from host-local shared-infra and package consumers
  async rebuildProjection(_documents: GraphIndexDocumentRecord[]): Promise<void> {
    // Memory mode already uses graphIndexRepo as the canonical store.
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
    const documents = await this.graphIndexRepo.listAll();
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
    return buildGraphRuntimeSnapshot(await this.graphIndexRepo.listAll());
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
