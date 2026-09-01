import type { ScoredEntry } from '../retrieval-types.js';
import type { KnowledgeRecord } from '../store.js';

export async function hybridRecall(query: string, entries: KnowledgeRecord[]): Promise<ScoredEntry[]> {
  // Placeholder hybrid recall that delegates to existing keyword+semantic
  return [];
}
