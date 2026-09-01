import type { ScoredEntry } from '../retrieval-types.js';
import type { KnowledgeRecord } from '../store.js';

export async function graphRecall(query: string, entries: KnowledgeRecord[]): Promise<ScoredEntry[]> {
  return [];
}
