import type {
  Graph,
  GraphIndexDocumentRecord,
  GraphIndexRepositoryPort,
  GraphNodeRecord,
  GraphQueryBackend,
  GraphQueryExpansionView,
  GraphQueryNodeView,
  GraphQueryRuntimeState,
} from '@trapmap/contracts';
import { buildLocalExpansionView as buildGraphologyLocalExpansionView } from '@trapmap/contracts';
import { buildGraphSourceKey, projectGraphDocument } from './projector.js';

interface Neo4jRecordLike {
  get(key: string): unknown;
}

interface Neo4jQueryClient {
  close?(): Promise<void>;
  read(query: string, params?: Record<string, unknown>): Promise<Neo4jRecordLike[]>;
  verifyConnectivity(): Promise<void>;
  write(query: string, params?: Record<string, unknown>): Promise<void>;
}

export interface Neo4jGraphQueryBackendConfig {
  database: string;
  password: string;
  uri: string;
  username: string;
}

export class Neo4jGraphQueryBackend implements GraphQueryBackend {
  readonly kind = 'neo4j' as const;

  constructor(
    private readonly graphIndexRepo: GraphIndexRepositoryPort,
    private readonly client: Neo4jQueryClient,
  ) {}

  isEnabled(): boolean {
    return true;
  }

  getRuntimeState(): GraphQueryRuntimeState {
    return {
      mode: 'enabled-primary',
      backendKind: 'neo4j',
      failOpen: false,
    };
  }

  async healthcheck() {
    try {
      await this.client.verifyConnectivity();
      return {
        ok: true,
        mode: 'enabled-primary' as const,
      };
    } catch (error) {
      return {
        ok: false,
        mode: 'enabled-primary' as const,
        detail: describeError(error),
      };
    }
  }

  async upsertDocument(document: GraphIndexDocumentRecord): Promise<void> {
    const projected = projectGraphDocument(document);

    await this.client.write(DELETE_SOURCE_RELATIONSHIPS_QUERY, {
      sourceKey: projected.source.key,
    });
    await this.client.write(UPSERT_SOURCE_QUERY, {
      source: projected.source,
    });
    await this.client.write(UPSERT_NODES_QUERY, {
      sourceKey: projected.source.key,
      nodes: projected.nodes,
    });
    await this.client.write(UPSERT_RELATIONSHIPS_QUERY, {
      relationships: projected.relationships,
    });
    await this.client.write(CLEAN_ORPHAN_NODES_QUERY);
  }

  async removeSource(sourceType: 'trap' | 'skill', sourceId: string): Promise<void> {
    await this.client.write(DELETE_SOURCE_RELATIONSHIPS_QUERY, {
      sourceKey: buildGraphSourceKey(sourceType, sourceId),
    });
    await this.client.write(DELETE_SOURCE_QUERY, {
      sourceType,
      sourceId,
    });
    await this.client.write(CLEAN_ORPHAN_NODES_QUERY);
  }

  async rebuildProjection(documents: GraphIndexDocumentRecord[]): Promise<void> {
    await this.client.write(CLEAR_SOURCE_QUERY);
    await this.client.write(CLEAR_GRAPH_NODE_QUERY);
    for (const document of documents) {
      await this.upsertDocument(document);
    }
  }

  async expandSourcesOneHop(params: {
    queryLabels: Set<string>;
    eligibleSourceIds?: Set<string>;
  }): Promise<Set<string>> {
    const labels = Array.from(params.queryLabels);
    if (labels.length === 0) {
      return new Set();
    }

    const rows = await this.client.read(EXPAND_SOURCES_ONE_HOP_QUERY, {
      eligibleSourceIds: Array.from(params.eligibleSourceIds ?? []),
      filterEligible: params.eligibleSourceIds !== undefined,
      queryLabels: labels,
    });

    return new Set(rows.map((row) => String(row.get('sourceId'))));
  }

  async calculateSourceRelationStrength(params: {
    sourceId: string;
    queryLabels: Set<string>;
  }): Promise<number> {
    if (params.queryLabels.size === 0) {
      return 0;
    }

    const rows = await this.client.read(CALCULATE_RELATION_STRENGTH_QUERY, {
      queryLabels: Array.from(params.queryLabels),
      sourceId: params.sourceId,
    });

    return Number(rows[0]?.get('strength') ?? 0);
  }

  async getSourceNodeIds(sourceIds: string[]): Promise<Map<string, Set<string>>> {
    const result = new Map<string, Set<string>>();
    if (sourceIds.length === 0) {
      return result;
    }

    const rows = await this.client.read(GET_SOURCE_NODE_IDS_QUERY, { sourceIds });
    for (const row of rows) {
      const sourceId = String(row.get('sourceId'));
      const nodeId = String(row.get('nodeId'));
      const existing = result.get(sourceId) ?? new Set<string>();
      existing.add(nodeId);
      result.set(sourceId, existing);
    }

    return result;
  }

  async buildLocalExpansionView(params: {
    seedNodeIds: string[];
    maxDepth: number;
    auth: { teamId: string | null; securityLevel: number };
  }): Promise<GraphQueryExpansionView> {
    if (params.seedNodeIds.length === 0) {
      return {
        graph: buildGraphologyLocalExpansionView({
          documents: [],
          maxDepth: params.maxDepth,
          seedNodeIds: [],
        }),
        nodeViewsById: new Map(),
        nodeIdsBySourceId: new Map(),
      };
    }

    const rows = await this.client.read(buildBoundedSourceFetchQuery(params.maxDepth), {
      securityLevel: params.auth.securityLevel,
      seedNodeIds: params.seedNodeIds,
      teamId: params.auth.teamId,
    });

    const sourceRefs = rows.map((row) => ({
      sourceId: String(row.get('sourceId')),
      sourceType: row.get('sourceType') as 'trap' | 'skill',
    }));

    const documents = await loadDocumentsBySourceRefs(this.graphIndexRepo, sourceRefs);
    const graph = buildGraphologyLocalExpansionView({
      documents,
      seedNodeIds: params.seedNodeIds,
      maxDepth: params.maxDepth,
    });

    return buildExpansionView(graph, documents);
  }

  async findMitigatingSkills(trapNodeIds: string[]): Promise<string[]> {
    if (trapNodeIds.length === 0) {
      return [];
    }

    const rows = await this.client.read(FIND_MITIGATING_SKILLS_QUERY, {
      trapNodeIds,
    });

    return rows.map((row) => String(row.get('nodeId')));
  }
}

export async function createNeo4jGraphQueryBackend(args: {
  config: Neo4jGraphQueryBackendConfig;
  graphIndexRepo: GraphIndexRepositoryPort;
}): Promise<Neo4jGraphQueryBackend> {
  const client = await createNeo4jQueryClient(args.config);
  return new Neo4jGraphQueryBackend(args.graphIndexRepo, client);
}

async function createNeo4jQueryClient(
  config: Neo4jGraphQueryBackendConfig,
): Promise<Neo4jQueryClient> {
  const loadModule = new Function('moduleName', 'return import(moduleName);') as (
    moduleName: string,
  ) => Promise<{
    auth: { basic(username: string, password: string): unknown };
    driver(
      uri: string,
      authToken: unknown,
    ): {
      close(): Promise<void>;
      session(options?: { database?: string }): {
        close(): Promise<void>;
        run(
          query: string,
          params?: Record<string, unknown>,
        ): Promise<{ records: Neo4jRecordLike[] }>;
      };
      verifyConnectivity(): Promise<void>;
    };
  }>;
  const neo4j = await loadModule('neo4j-driver');
  const driver = neo4j.driver(config.uri, neo4j.auth.basic(config.username, config.password));

  return {
    close: async () => driver.close(),
    verifyConnectivity: async () => driver.verifyConnectivity(),
    read: async (query, params) => {
      const session = driver.session({ database: config.database });
      try {
        const result = await session.run(query, params);
        return result.records;
      } finally {
        await session.close();
      }
    },
    write: async (query, params) => {
      const session = driver.session({ database: config.database });
      try {
        await session.run(query, params);
      } finally {
        await session.close();
      }
    },
  };
}

async function loadDocumentsBySourceRefs(
  graphIndexRepo: GraphIndexRepositoryPort,
  sourceRefs: Array<{ sourceId: string; sourceType: 'trap' | 'skill' }>,
): Promise<GraphIndexDocumentRecord[]> {
  const deduped = new Map<string, { sourceId: string; sourceType: 'trap' | 'skill' }>();
  for (const sourceRef of sourceRefs) {
    deduped.set(buildGraphSourceKey(sourceRef.sourceType, sourceRef.sourceId), sourceRef);
  }

  const documents = await Promise.all(
    Array.from(deduped.values()).map((sourceRef) =>
      graphIndexRepo.listBySource(sourceRef.sourceType, sourceRef.sourceId),
    ),
  );

  return documents.flat();
}

function buildExpansionView(
  graph: Graph,
  documents: GraphIndexDocumentRecord[],
): GraphQueryExpansionView {
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
        const existing = nodeIdsBySourceId.get(document.sourceId) ?? new Set<string>();
        existing.add(node.id);
        nodeIdsBySourceId.set(document.sourceId, existing);
      }
    }
  }

  return {
    graph,
    nodeViewsById,
    nodeIdsBySourceId,
  };
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

function buildBoundedSourceFetchQuery(maxDepth: number): string {
  const depth = Math.max(0, Math.min(6, Math.floor(maxDepth)));
  return `
    MATCH (seed:GraphNode)
    WHERE seed.id IN $seedNodeIds
    MATCH (seed)-[:REL*0..${depth}]-(reachable:GraphNode)
    WITH DISTINCT reachable
    MATCH (source:Source)-[:CONTAINS]->(reachable)
    WHERE source.requiredLevel <= $securityLevel
      AND ($teamId IS NULL OR source.teamId IS NULL OR source.teamId = $teamId)
    RETURN DISTINCT source.sourceType AS sourceType, source.sourceId AS sourceId
  `;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const UPSERT_SOURCE_QUERY = `
  MERGE (source:Source {sourceType: $source.sourceType, sourceId: $source.sourceId})
  SET source.key = $source.key,
      source.revision = $source.revision,
      source.contentHash = $source.contentHash,
      source.teamId = $source.teamId,
      source.scope = $source.scope,
      source.requiredLevel = $source.requiredLevel,
      source.evidence = $source.evidence,
      source.createdAt = $source.createdAt,
      source.updatedAt = $source.updatedAt
`;

const UPSERT_NODES_QUERY = `
  MATCH (source:Source {key: $sourceKey})
  UNWIND $nodes AS node
  MERGE (graphNode:GraphNode {id: node.id})
  SET graphNode.kind = node.kind,
      graphNode.label = node.label,
      graphNode.normalizedLabel = node.normalizedLabel,
      graphNode.evidence = node.evidence,
      graphNode.severity = node.severity,
      graphNode.mitigates = node.mitigates
  MERGE (source)-[:CONTAINS]->(graphNode)
`;

const UPSERT_RELATIONSHIPS_QUERY = `
  UNWIND $relationships AS edge
  MERGE (src:GraphNode {id: edge.sourceNodeId})
  MERGE (dst:GraphNode {id: edge.targetNodeId})
  MERGE (src)-[rel:REL {key: edge.key}]->(dst)
  SET rel.id = edge.id,
      rel.sourceKey = edge.sourceKey,
      rel.relationType = edge.relationType,
      rel.strength = edge.strength,
      rel.evidence = edge.evidence
`;

const DELETE_SOURCE_RELATIONSHIPS_QUERY = `
  MATCH ()-[rel:REL {sourceKey: $sourceKey}]->()
  DELETE rel
`;

const DELETE_SOURCE_QUERY = `
  MATCH (source:Source {sourceType: $sourceType, sourceId: $sourceId})
  DETACH DELETE source
`;

const CLEAN_ORPHAN_NODES_QUERY = `
  MATCH (graphNode:GraphNode)
  WHERE NOT (:Source)-[:CONTAINS]->(graphNode)
    AND NOT (graphNode)-[:REL]-()
  DETACH DELETE graphNode
`;

const CLEAR_SOURCE_QUERY = `
  MATCH (source:Source)
  DETACH DELETE source
`;

const CLEAR_GRAPH_NODE_QUERY = `
  MATCH (graphNode:GraphNode)
  DETACH DELETE graphNode
`;

const EXPAND_SOURCES_ONE_HOP_QUERY = `
  MATCH (seed:GraphNode)
  WHERE seed.normalizedLabel IN $queryLabels
  OPTIONAL MATCH (seed)-[:REL]-(neighbor:GraphNode)
  WITH collect(DISTINCT seed) + collect(DISTINCT neighbor) AS graphNodes
  UNWIND graphNodes AS graphNode
  MATCH (source:Source)-[:CONTAINS]->(graphNode)
  WHERE NOT $filterEligible OR source.sourceId IN $eligibleSourceIds
  RETURN DISTINCT source.sourceId AS sourceId
`;

const CALCULATE_RELATION_STRENGTH_QUERY = `
  MATCH (source:Source {sourceId: $sourceId})-[:CONTAINS]->(owned:GraphNode)
  MATCH (owned)-[rel:REL]-(:GraphNode)
  WHERE rel.sourceKey = source.key
  WITH DISTINCT rel, startNode(rel) AS srcNode, endNode(rel) AS dstNode
  WHERE srcNode.normalizedLabel IN $queryLabels OR dstNode.normalizedLabel IN $queryLabels
  RETURN coalesce(sum(CASE rel.strength WHEN 'hard' THEN 2 ELSE 1 END), 0) AS strength
`;

const GET_SOURCE_NODE_IDS_QUERY = `
  MATCH (source:Source)-[:CONTAINS]->(node:GraphNode)
  WHERE source.sourceId IN $sourceIds
  RETURN source.sourceId AS sourceId, node.id AS nodeId
`;

const FIND_MITIGATING_SKILLS_QUERY = `
  MATCH (skillNode:GraphNode)-[rel:REL]->(trapNode:GraphNode)
  WHERE rel.relationType = 'mitigates'
    AND trapNode.id IN $trapNodeIds
  RETURN DISTINCT skillNode.id AS nodeId
`;
