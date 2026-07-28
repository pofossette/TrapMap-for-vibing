import { describe, expect, it } from 'vitest';

import type { GraphIndexDocumentRecord, GraphIndexRepositoryPort } from '@trapmap/contracts';
import { nowIso } from '@trapmap/server/lib/store.js';

import { Neo4jGraphQueryBackend } from './neo4j-backend.js';

function makeGraphDocument(
  overrides: Partial<GraphIndexDocumentRecord> = {},
): GraphIndexDocumentRecord {
  const now = nowIso();
  return {
    id: 'graphdoc_skill_skill-1_r1',
    sourceType: 'skill',
    sourceId: 'skill-1',
    revision: 1,
    contentHash: 'content-hash',
    teamId: null,
    scope: 'global',
    requiredLevel: 0,
    nodes: [
      {
        id: 'skill:skill-1',
        kind: 'skill',
        label: 'Restart Service',
        evidence: 'skill evidence',
        mitigates: ['trap:trap-1'],
      },
      {
        id: 'tool:docker',
        kind: 'tool',
        label: 'Docker',
        evidence: 'tool evidence',
      },
    ],
    edges: [
      {
        id: 'edge-1',
        sourceNodeId: 'skill:skill-1',
        targetNodeId: 'tool:docker',
        relationType: 'requires',
        strength: 'hard',
        evidence: 'edge evidence',
      },
      {
        id: 'edge-2',
        sourceNodeId: 'skill:skill-1',
        targetNodeId: 'trap:trap-1',
        relationType: 'mitigates',
        strength: 'soft',
        evidence: 'mitigation evidence',
      },
    ],
    evidence: 'doc evidence',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createFakeClient() {
  const writes: Array<{ query: string; params?: Record<string, unknown> }> = [];
  const reads = new Map<string, Array<Record<string, unknown>>>();

  return {
    client: {
      async read(query: string) {
        const rows = reads.get(query) ?? [];
        return rows.map((row) => ({
          get(key: string) {
            return row[key];
          },
        }));
      },
      async verifyConnectivity() {},
      async write(query: string, params?: Record<string, unknown>) {
        writes.push({ query, params });
      },
    },
    reads,
    writes,
  };
}

async function createRepoWithDocuments(
  documents: GraphIndexDocumentRecord[],
): Promise<GraphIndexRepositoryPort> {
  const records = [...documents];
  return {
    async insert(document) {
      records.push(document);
    },
    async getById(documentId) {
      return records.find((document) => document.id === documentId) ?? null;
    },
    async listBySource(sourceType, sourceId) {
      return records.filter(
        (document) => document.sourceType === sourceType && document.sourceId === sourceId,
      );
    },
    async listAll() {
      return records;
    },
    async upsert(document) {
      const index = records.findIndex((current) => current.id === document.id);
      if (index >= 0) records[index] = document;
      else records.push(document);
    },
    async remove(documentId) {
      const index = records.findIndex((document) => document.id === documentId);
      if (index >= 0) records.splice(index, 1);
    },
    async removeBySource(sourceType, sourceId) {
      for (let index = records.length - 1; index >= 0; index -= 1) {
        const document = records[index];
        if (document?.sourceType === sourceType && document.sourceId === sourceId) {
          records.splice(index, 1);
        }
      }
    },
  };
}

describe('Neo4jGraphQueryBackend', () => {
  it('upserts projected source, nodes, and relationships', async () => {
    const { client, writes } = createFakeClient();
    const repo = await createRepoWithDocuments([]);
    const backend = new Neo4jGraphQueryBackend(repo, client);

    await backend.upsertDocument(makeGraphDocument());

    expect(writes).toHaveLength(5);
    expect(writes[0]?.params).toMatchObject({ sourceKey: 'skill:skill-1' });
    expect(writes[1]?.params).toMatchObject({
      source: expect.objectContaining({ key: 'skill:skill-1', sourceId: 'skill-1' }),
    });
    expect(writes[2]?.params).toMatchObject({
      nodes: expect.arrayContaining([expect.objectContaining({ id: 'skill:skill-1' })]),
    });
    expect(writes[3]?.params).toMatchObject({
      relationships: expect.arrayContaining([
        expect.objectContaining({ key: 'skill:skill-1:edge-1' }),
      ]),
    });
  });

  it('removes a source projection and cleans orphan nodes', async () => {
    const { client, writes } = createFakeClient();
    const repo = await createRepoWithDocuments([]);
    const backend = new Neo4jGraphQueryBackend(repo, client);

    await backend.removeSource('skill', 'skill-1');

    expect(writes).toHaveLength(3);
    expect(writes[0]?.params).toEqual({ sourceKey: 'skill:skill-1' });
    expect(writes[1]?.params).toEqual({ sourceId: 'skill-1', sourceType: 'skill' });
  });

  it('maps one-hop source expansion and relation strength from read rows', async () => {
    const fake = createFakeClient();
    const repo = await createRepoWithDocuments([]);
    const backend = new Neo4jGraphQueryBackend(repo, fake.client);

    fake.reads.set(
      `
  MATCH (seed:GraphNode)
  WHERE seed.normalizedLabel IN $queryLabels
  OPTIONAL MATCH (seed)-[:REL]-(neighbor:GraphNode)
  WITH collect(DISTINCT seed) + collect(DISTINCT neighbor) AS graphNodes
  UNWIND graphNodes AS graphNode
  MATCH (source:Source)-[:CONTAINS]->(graphNode)
  WHERE NOT $filterEligible OR source.sourceId IN $eligibleSourceIds
  RETURN DISTINCT source.sourceId AS sourceId
`,
      [{ sourceId: 'skill-1' }, { sourceId: 'skill-2' }],
    );
    fake.reads.set(
      `
  MATCH (source:Source {sourceId: $sourceId})-[:CONTAINS]->(owned:GraphNode)
  MATCH (owned)-[rel:REL]-(:GraphNode)
  WHERE rel.sourceKey = source.key
  WITH DISTINCT rel, startNode(rel) AS srcNode, endNode(rel) AS dstNode
  WHERE srcNode.normalizedLabel IN $queryLabels OR dstNode.normalizedLabel IN $queryLabels
  RETURN coalesce(sum(CASE rel.strength WHEN 'hard' THEN 2 ELSE 1 END), 0) AS strength
`,
      [{ strength: 3 }],
    );

    const expanded = await backend.expandSourcesOneHop({
      queryLabels: new Set(['docker']),
    });
    const strength = await backend.calculateSourceRelationStrength({
      sourceId: 'skill-1',
      queryLabels: new Set(['docker']),
    });

    expect(expanded).toEqual(new Set(['skill-1', 'skill-2']));
    expect(strength).toBe(3);
  });

  it('builds a bounded local expansion view from Neo4j source refs plus PG truth', async () => {
    const document = makeGraphDocument();
    const fake = createFakeClient();
    const repo = await createRepoWithDocuments([document]);
    const backend = new Neo4jGraphQueryBackend(repo, fake.client);
    const query = `
    MATCH (seed:GraphNode)
    WHERE seed.id IN $seedNodeIds
    MATCH (seed)-[:REL*0..2]-(reachable:GraphNode)
    WITH DISTINCT reachable
    MATCH (source:Source)-[:CONTAINS]->(reachable)
    WHERE source.requiredLevel <= $securityLevel
      AND ($teamId IS NULL OR source.teamId IS NULL OR source.teamId = $teamId)
    RETURN DISTINCT source.sourceType AS sourceType, source.sourceId AS sourceId
  `;
    fake.reads.set(query, [{ sourceType: 'skill', sourceId: 'skill-1' }]);

    const expansionView = await backend.buildLocalExpansionView({
      seedNodeIds: ['skill:skill-1'],
      maxDepth: 2,
      auth: { teamId: null, securityLevel: 0 },
    });

    expect(expansionView.graph.hasNode('skill:skill-1')).toBe(true);
    expect(expansionView.nodeViewsById.get('skill:skill-1')).toMatchObject({
      sourceId: 'skill-1',
      sourceType: 'skill',
    });
  });
});

const neo4jEnvReady =
  !!process.env.TRAPMAP_GRAPH_DB_URI &&
  !!process.env.TRAPMAP_GRAPH_DB_USERNAME &&
  !!process.env.TRAPMAP_GRAPH_DB_PASSWORD;
const describeIfNeo4j = neo4jEnvReady ? describe : describe.skip;

describeIfNeo4j('Neo4jGraphQueryBackend integration', () => {
  it('is gated by graph DB env vars', () => {
    expect(neo4jEnvReady).toBe(true);
  });
});
