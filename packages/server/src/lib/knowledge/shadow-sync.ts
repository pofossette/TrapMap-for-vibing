import type { KnowledgeRecord, StoreData } from '@trapmap/server/lib/store.js';

/**
 * Keep the legacy store snapshot aligned with the PG-backed knowledge record.
 * This preserves downstream readers that still depend on snapshot knowledge data.
 */
export function upsertKnowledgeEntryShadow(data: StoreData, entry: KnowledgeRecord): void {
  const index = data.knowledgeEntries.findIndex((candidate) => candidate.id === entry.id);

  if (index >= 0) {
    data.knowledgeEntries[index] = entry;
    return;
  }

  data.knowledgeEntries.push(entry);
}
