import type {
  GraphIndexDocumentRecord,
  GraphIndexRepositoryPort,
  GraphNodeRecord,
} from '@trapmap/contracts';

import {
  type Graph,
  buildGraphRuntimeSnapshot,
  buildLocalExpansionView as buildGraphologyLocalExpansionView,
  calculateSourceRelationStrength,
  expandSourcesOneHop,
} from './graphology.js';

export type GraphQueryBackendKind = 'memory' | 'neo4j';
export type GraphQueryMode = 'disabled' | 'enabled-primary' | 'enabled-fallback';

export interface GraphQueryBackendHealth {
  ok: boolean;
  mode: GraphQueryMode;
  detail?: string;
}

export interface GraphQueryRuntimeState {
  mode: GraphQueryMode;
  backendKind: GraphQueryBackendKind;
  failOpen: boolean;
  detail?: string;
}

export interface GraphQueryNodeView {
  sourceId: string;
  sourceType: GraphIndexDocumentRecord['sourceType'];
  teamId: string | null;
  scope: GraphIndexDocumentRecord['scope'];
  requiredLevel: number;
  documentEvidence: string;
  node: GraphNodeRecord;
}

export interface GraphQueryExpansionView {
  graph: Graph;
  nodeViewsById: Map<string, GraphQueryNodeView>;
  nodeIdsBySourceId: Map<string, Set<string>>;
}

export interface GraphQueryBackend {
  readonly kind: GraphQueryBackendKind;
  isEnabled(): boolean;
  getRuntimeState(): GraphQueryRuntimeState;
  healthcheck(): Promise<GraphQueryBackendHealth>;
  upsertDocument(document: GraphIndexDocumentRecord): Promise<void>;
  removeSource(sourceType: 'trap' | 'skill', sourceId: string): Promise<void>;
  rebuildProjection(documents: GraphIndexDocumentRecord[]): Promise<void>;
  expandSourcesOneHop(params: {
    queryLabels: Set<string>;
    eligibleSourceIds?: Set<string>;
  }): Promise<Set<string>>;
  calculateSourceRelationStrength(params: {
    sourceId: string;
    queryLabels: Set<string>;
  }): Promise<number>;
  getSourceNodeIds(sourceIds: string[]): Promise<Map<string, Set<string>>>;
  buildLocalExpansionView(params: {
    seedNodeIds: string[];
    maxDepth: number;
    auth: { teamId: string | null; securityLevel: number };
  }): Promise<GraphQueryExpansionView>;
  findMitigatingSkills(trapNodeIds: string[]): Promise<string[]>;
}

class MemoryGraphQueryBackend implements GraphQueryBackend {
  readonly kind = 'memory' as const;

  constructor(private readonly graphIndexRepo: GraphIndexRepositoryPort) {}

  isEnabled(): boolean {
    return false;
  }

  getRuntimeState(): GraphQueryRuntimeState {
    return { mode: 'disabled', backendKind: 'memory', failOpen: false };
  }

  async healthcheck(): Promise<GraphQueryBackendHealth> {
    return { ok: true, mode: 'disabled' };
  }

  async upsertDocument(document: GraphIndexDocumentRecord): Promise<void> {
    await this.graphIndexRepo.upsert(document);
  }

  async removeSource(sourceType: 'trap' | 'skill', sourceId: string): Promise<void> {
    await this.graphIndexRepo.removeBySource(sourceType, sourceId);
  }

  async rebuildProjection(_documents: GraphIndexDocumentRecord[]): Promise<void> {
    // Memory mode already uses graphIndexRepo as the canonical store.
  }

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

  async getSourceNodeIds(sourceIds: string[]): Promise<Map<string, Set<string>>> {
    const runtime = await this.loadRuntime();
    return new Map(
      sourceIds.map((sourceId) => [
        sourceId,
        new Set(runtime.nodeIdsBySourceId.get(sourceId) ?? []),
      ]),
    );
  }

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
): GraphQueryBackend {
  return new MemoryGraphQueryBackend(graphIndexRepo);
}

function isCanonicalOwner(document: GraphIndexDocumentRecord, node: GraphNodeRecord): boolean {
  return (
    (node.kind === 'trap' &&
      document.sourceType === 'trap' &&
      node.id === `trap:${document.sourceId}`) ||
    (node.kind === 'skill' &&
      document.sourceType === 'skill' &&
      node.id === `skill:${document.sourceId}`)
  );
}
