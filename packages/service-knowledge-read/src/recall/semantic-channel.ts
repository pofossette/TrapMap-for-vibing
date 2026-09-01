import type { ScoredEntry } from '../retrieval-types.js';
import type { KnowledgeRecord } from '../store.js';

export async function semanticRecall(query: string, entries: KnowledgeRecord[]): Promise<ScoredEntry[]> {
  return [];
}
