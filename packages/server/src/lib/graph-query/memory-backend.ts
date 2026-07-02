import type { GraphIndexRepository } from '@trapmap/server/lib/graph-index/repository.js';
import {
  type GraphIndexDocumentRecord,
  type GraphNodeRecord,
  buildGraphRuntimeSnapshot,
  buildLocalExpansionView as buildGraphologyLocalExpansionView,
  calculateSourceRelationStrength,
  expandSourcesOneHop,
} from '@trapmap/server/lib/indexing/graph-lite/index.js';

import type {
  GraphQueryBackend,
  GraphQueryExpansionView,
  GraphQueryNodeView,
  GraphQueryRuntimeState,
} from './index.js';

class MemoryGraphQueryBackend implements GraphQueryBackend {
  readonly kind = 'memory' as const;

  constructor(private readonly graphIndexRepo: GraphIndexRepository) {}

  isEnabled(): boolean {
    return false;
  }

  getRuntimeState(): GraphQueryRuntimeState {
    return {
      mode: 'disabled',
      backendKind: 'memory',
      failOpen: false,
    };
  }

  async healthcheck() {
    return {
      ok: true,
      mode: 'disabled' as const,
    };
  }

  async upsertDocument(document: Parameters<GraphIndexRepository['upsert']>[0]): Promise<void> {
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
    const runtime = await this.loadRuntime();
    const expanded = expandSourcesOneHop(runtime, params.queryLabels);

    if (!params.eligibleSourceIds) {
      return expanded;
    }

    const filtered = new Set<string>();
    for (const sourceId of expanded) {
      if (params.eligibleSourceIds.has(sourceId)) {
        filtered.add(sourceId);
      }
    }

    return filtered;
  }

  async calculateSourceRelationStrength(params: {
    sourceId: string;
    queryLabels: Set<string>;
  }): Promise<number> {
    const runtime = await this.loadRuntime();
    return calculateSourceRelationStrength(runtime, params.sourceId, params.queryLabels);
  }

  async getSourceNodeIds(sourceIds: string[]): Promise<Map<string, Set<string>>> {
    const runtime = await this.loadRuntime();
    const result = new Map<string, Set<string>>();

    for (const sourceId of sourceIds) {
      result.set(sourceId, new Set(runtime.nodeIdsBySourceId.get(sourceId) ?? []));
    }

    return result;
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

        const nextNodeView = {
          sourceId: document.sourceId,
          sourceType: document.sourceType,
          teamId: document.teamId,
          scope: document.scope,
          requiredLevel: document.requiredLevel,
          documentEvidence: document.evidence,
          node,
        };
        const existingNodeView = nodeViewsById.get(node.id);
        const ownedByDocument = isCanonicalOwner(document, node);

        if (ownedByDocument || (existingNodeView === undefined && !ownedByDocument)) {
          nodeViewsById.set(node.id, nextNodeView);
        }

        if (ownedByDocument) {
          if (!nodeIdsBySourceId.has(document.sourceId)) {
            nodeIdsBySourceId.set(document.sourceId, new Set());
          }
          nodeIdsBySourceId.get(document.sourceId)?.add(node.id);
        }
      }
    }

    return {
      graph,
      nodeViewsById,
      nodeIdsBySourceId,
    };
  }

  async findMitigatingSkills(trapNodeIds: string[]): Promise<string[]> {
    const runtime = await this.loadRuntime();
    const mitigatingSkillIds = new Set<string>();

    for (const trapNodeId of trapNodeIds) {
      const skillNodeIds = runtime.mitigatingSkillNodeIdsByTrapNodeId.get(trapNodeId);
      if (!skillNodeIds) {
        continue;
      }

      for (const skillNodeId of skillNodeIds) {
        mitigatingSkillIds.add(skillNodeId);
      }
    }

    return Array.from(mitigatingSkillIds);
  }

  private async loadRuntime() {
    const documents = await this.graphIndexRepo.listAll();
    return buildGraphRuntimeSnapshot(documents);
  }
}

export function createMemoryGraphQueryBackend(
  graphIndexRepo: GraphIndexRepository,
): MemoryGraphQueryBackend {
  return new MemoryGraphQueryBackend(graphIndexRepo);
}

function isCanonicalOwner(document: GraphIndexDocumentRecord, node: GraphNodeRecord): boolean {
  if (node.kind === 'trap' && document.sourceType === 'trap') {
    return node.id === `trap:${document.sourceId}`;
  }

  if (node.kind === 'skill' && document.sourceType === 'skill') {
    return node.id === `skill:${document.sourceId}`;
  }

  return false;
}
