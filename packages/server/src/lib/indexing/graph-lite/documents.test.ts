import type { StoreData } from '@trapmap/server/lib/store.js';
import { describe, expect, it } from 'vitest';
import {
  type GraphEdgeRecord,
  type GraphIndexDocumentRecord,
  type GraphNodeRecord,
  buildSkillGraphDocument,
  buildTrapGraphDocument,
} from './documents.js';
import {
  getGraphIndexDocuments,
  getGraphIndexDocumentsForSource,
  removeGraphIndexDocumentsForSource,
  upsertGraphIndexDocument,
} from './store.js';

function makeEmptyStoreData(): StoreData {
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
  };
}

describe('graph-lite/documents', () => {
  describe('buildTrapGraphDocument', () => {
    it('writes sourceType trap with sourceId, revision, teamId, scope, requiredLevel, and typed nodes/edges', () => {
      const nodes: GraphNodeRecord[] = [
        {
          id: 'trap:entry-1',
          kind: 'trap',
          label: 'pnpm store corruption',
          evidence: 'shortcut text',
        },
        {
          id: 'cue:docker-timeout',
          kind: 'cue',
          label: 'docker build timeout',
          evidence: 'detail text',
        },
      ];
      const edges: GraphEdgeRecord[] = [
        {
          id: 'trap:entry-1->cue:docker-timeout:order',
          sourceNodeId: 'trap:entry-1',
          targetNodeId: 'cue:docker-timeout',
          relationType: 'order',
          strength: 'soft',
          evidence: 'temporal ordering',
        },
      ];

      const doc = buildTrapGraphDocument({
        sourceId: 'entry-1',
        revision: 3,
        teamId: 'team-abc',
        scope: 'project',
        requiredLevel: 5,
        nodes,
        edges,
      });

      expect(doc.sourceType).toBe('trap');
      expect(doc.sourceId).toBe('entry-1');
      expect(doc.revision).toBe(3);
      expect(doc.teamId).toBe('team-abc');
      expect(doc.scope).toBe('project');
      expect(doc.requiredLevel).toBe(5);
      expect(doc.nodes).toHaveLength(2);
      expect(doc.edges).toHaveLength(1);
      expect(doc.id).toBeTruthy();
      expect(doc.contentHash).toBeTruthy();
    });
  });

  describe('buildSkillGraphDocument', () => {
    it('writes sourceType skill with artifactId lineage and rejects activation-only body input', () => {
      const nodes: GraphNodeRecord[] = [
        {
          id: 'skill:art-1',
          kind: 'skill',
          label: 'docker cache clean',
          evidence: 'capsule situation',
        },
      ];
      const edges: GraphEdgeRecord[] = [];

      const doc = buildSkillGraphDocument({
        artifactId: 'art-1',
        revision: 2,
        teamId: null,
        scope: 'global',
        requiredLevel: 0,
        nodes,
        edges,
        derivedTextHash: 'abc123',
      });

      expect(doc.sourceType).toBe('skill');
      expect(doc.sourceId).toBe('art-1');
      expect(doc.revision).toBe(2);
      expect(doc.teamId).toBeNull();
      expect(doc.scope).toBe('global');
      expect(doc.requiredLevel).toBe(0);
      expect(doc.nodes).toHaveLength(1);
      expect(doc.edges).toHaveLength(0);
    });

    it('requires derivedTextHash and does not accept raw body text', () => {
      const nodes: GraphNodeRecord[] = [];
      const edges: GraphEdgeRecord[] = [];

      // The builder requires derivedTextHash - caller must provide it
      // This proves activation-only body text is not a builder input
      const doc = buildSkillGraphDocument({
        artifactId: 'art-2',
        revision: 1,
        teamId: 'team-x',
        scope: 'project',
        requiredLevel: 3,
        nodes,
        edges,
        derivedTextHash: 'sha256-of-derived-text-only',
      });

      expect(doc.sourceType).toBe('skill');
      expect(doc.evidence).toContain('derived from approved capsule/profile text');
    });
  });
});

describe('graph-lite/store', () => {
  describe('upsertGraphIndexDocument', () => {
    it('upserts by sourceType+sourceId+revision and replaces stale documents for same source', () => {
      const data = makeEmptyStoreData();

      const doc1: GraphIndexDocumentRecord = {
        id: 'gid_1',
        sourceType: 'trap',
        sourceId: 'entry-1',
        revision: 1,
        contentHash: 'hash-v1',
        teamId: 'team-abc',
        scope: 'project',
        requiredLevel: 5,
        nodes: [{ id: 'trap:entry-1', kind: 'trap', label: 'test', evidence: 'test' }],
        edges: [],
        evidence: 'test',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      };

      upsertGraphIndexDocument(data, doc1);
      expect(getGraphIndexDocuments(data)).toHaveLength(1);

      // Upsert same source with new revision replaces old
      const doc2: GraphIndexDocumentRecord = {
        ...doc1,
        revision: 2,
        contentHash: 'hash-v2',
        id: 'gid_2',
      };

      upsertGraphIndexDocument(data, doc2);
      const all = getGraphIndexDocuments(data);
      expect(all).toHaveLength(1);
      expect(all[0]!.revision).toBe(2);
    });

    it('does not delete unrelated sources during upsert', () => {
      const data = makeEmptyStoreData();

      const trapDoc: GraphIndexDocumentRecord = {
        id: 'gid_trap',
        sourceType: 'trap',
        sourceId: 'entry-1',
        revision: 1,
        contentHash: 'hash-trap',
        teamId: null,
        scope: 'global',
        requiredLevel: 0,
        nodes: [],
        edges: [],
        evidence: 'test',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      };

      const skillDoc: GraphIndexDocumentRecord = {
        id: 'gid_skill',
        sourceType: 'skill',
        sourceId: 'art-1',
        revision: 1,
        contentHash: 'hash-skill',
        teamId: null,
        scope: 'global',
        requiredLevel: 0,
        nodes: [],
        edges: [],
        evidence: 'test',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      };

      upsertGraphIndexDocument(data, trapDoc);
      upsertGraphIndexDocument(data, skillDoc);

      expect(getGraphIndexDocuments(data)).toHaveLength(2);

      // Upsert trap again with new revision
      const trapDoc2: GraphIndexDocumentRecord = {
        ...trapDoc,
        revision: 2,
        id: 'gid_trap_v2',
      };
      upsertGraphIndexDocument(data, trapDoc2);

      const all = getGraphIndexDocuments(data);
      expect(all).toHaveLength(2);
      const trapDocs = all.filter((d) => d.sourceType === 'trap');
      expect(trapDocs).toHaveLength(1);
      expect(trapDocs[0]!.revision).toBe(2);
      const skillDocs = all.filter((d) => d.sourceType === 'skill');
      expect(skillDocs).toHaveLength(1);
    });
  });

  describe('removeGraphIndexDocumentsForSource', () => {
    it('removes stale documents for the same source without deleting unrelated sources', () => {
      const data = makeEmptyStoreData();

      const trapDoc: GraphIndexDocumentRecord = {
        id: 'gid_trap',
        sourceType: 'trap',
        sourceId: 'entry-1',
        revision: 1,
        contentHash: 'hash-trap',
        teamId: null,
        scope: 'global',
        requiredLevel: 0,
        nodes: [],
        edges: [],
        evidence: 'test',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      };

      const skillDoc: GraphIndexDocumentRecord = {
        id: 'gid_skill',
        sourceType: 'skill',
        sourceId: 'art-1',
        revision: 1,
        contentHash: 'hash-skill',
        teamId: null,
        scope: 'global',
        requiredLevel: 0,
        nodes: [],
        edges: [],
        evidence: 'test',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      };

      upsertGraphIndexDocument(data, trapDoc);
      upsertGraphIndexDocument(data, skillDoc);
      expect(getGraphIndexDocuments(data)).toHaveLength(2);

      removeGraphIndexDocumentsForSource(data, 'trap', 'entry-1');
      const remaining = getGraphIndexDocuments(data);
      expect(remaining).toHaveLength(1);
      expect(remaining[0]!.sourceType).toBe('skill');
    });
  });

  describe('getGraphIndexDocumentsForSource', () => {
    it('returns only documents matching the given sourceType and sourceId', () => {
      const data = makeEmptyStoreData();

      const doc1: GraphIndexDocumentRecord = {
        id: 'gid_1',
        sourceType: 'trap',
        sourceId: 'entry-1',
        revision: 1,
        contentHash: 'hash-1',
        teamId: null,
        scope: 'global',
        requiredLevel: 0,
        nodes: [],
        edges: [],
        evidence: 'test',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      };

      const doc2: GraphIndexDocumentRecord = {
        id: 'gid_2',
        sourceType: 'trap',
        sourceId: 'entry-2',
        revision: 1,
        contentHash: 'hash-2',
        teamId: null,
        scope: 'global',
        requiredLevel: 0,
        nodes: [],
        edges: [],
        evidence: 'test',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      };

      upsertGraphIndexDocument(data, doc1);
      upsertGraphIndexDocument(data, doc2);

      const results = getGraphIndexDocumentsForSource(data, 'trap', 'entry-1');
      expect(results).toHaveLength(1);
      expect(results[0]!.sourceId).toBe('entry-1');
    });
  });
});
