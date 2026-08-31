import { describe, expect, it } from 'vitest';

import {
  candidateIngestionNode,
  cronNode,
  governanceReviewNode,
  identityAccessNode,
  jobRuntimeNode,
  knowledgeReadNode,
  knowledgeWriteNode,
  serviceNodes,
} from '../../../../../src/nest/runtime/assembly/nodes/service-nodes.js';

describe('host-local assembly service node descriptors (D2 mapping)', () => {
  it('exposes the seven D2 service nodes with expected ids and provides', () => {
    const byId = new Map(serviceNodes.map((node) => [node.id, node]));
    expect(byId.size).toBe(7);

    expect(identityAccessNode.id).toBe('identity-access');
    expect(identityAccessNode.provides).toBe('identity');

    expect(candidateIngestionNode.id).toBe('candidate-ingestion');
    expect(candidateIngestionNode.provides).toBe('candidateIngestion');

    expect(governanceReviewNode.id).toBe('governance-review');
    expect(governanceReviewNode.provides).toBe('governanceReview');

    expect(jobRuntimeNode.id).toBe('job-runtime');
    expect(jobRuntimeNode.provides).toBe('jobRuntime');

    expect(knowledgeReadNode.id).toBe('knowledge-read');
    expect(knowledgeReadNode.provides).toBe('knowledgeRead');

    expect(knowledgeWriteNode.id).toBe('knowledge-write');
    expect(knowledgeWriteNode.provides).toBe('knowledgeWrite');

    expect(cronNode.id).toBe('cron');
    expect(cronNode.provides).toBe('cronRegistry');
  });

  it('has unique ids across all service nodes', () => {
    const ids = serviceNodes.map((node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every service node injects the transitional hostLocalRuntime', () => {
    for (const node of serviceNodes) {
      expect(node.inject).toContain('hostLocalRuntime');
    }
  });

  it('cross-context nodes inject the ports they consume', () => {
    expect(governanceReviewNode.inject).toEqual(
      expect.arrayContaining(['knowledgeWrite', 'jobRuntime']),
    );
    expect(candidateIngestionNode.inject).toEqual(
      expect.arrayContaining(['knowledgeWrite', 'jobRuntime']),
    );
  });
});
