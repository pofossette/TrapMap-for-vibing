import { normalizeQuery, scoreKeywordEntry, tokenizeText } from '@trapmap/backend-core';
import type { KnowledgeReadRecallChannel } from './retrieval-orchestration.js';
import type { RecallCandidate } from './retrieval-types.js';
import type { KnowledgeRecord } from './store.js';

export { normalizeQuery, tokenizeText as tokenize } from '@trapmap/backend-core';

function tokenizeEntry(entry: KnowledgeRecord): {
  shortcut: Set<string>;
  detail: Set<string>;
  labels: Set<string>;
} {
  if (entry.indexState?.keyword?.status === 'synced') {
    const persistedState = (entry.indexState.keyword as any).persistedState;
    if (persistedState?.fieldTokens) {
      return {
        shortcut: new Set(persistedState.fieldTokens.shortcut),
        detail: new Set(persistedState.fieldTokens.detail),
        labels: new Set(persistedState.fieldTokens.labels),
      };
    }
  }

  return {
    shortcut: new Set(tokenizeText(entry.shortcut)),
    detail: new Set(tokenizeText(entry.detail)),
    labels: new Set(tokenizeText(entry.labels.join(' '))),
  };
}

export async function keywordRecall(
  queryText: string,
  entries: KnowledgeRecord[],
): Promise<RecallCandidate[]> {
  const queryTokens = normalizeQuery(queryText);
  if (queryTokens.length === 0 || entries.length === 0) {
    return [];
  }

  const entryTokenMaps = new Map<string, ReturnType<typeof tokenizeEntry>>();
  for (const entry of entries) {
    entryTokenMaps.set(entry.id, tokenizeEntry(entry));
  }

  const candidates: RecallCandidate[] = [];
  for (const entry of entries) {
    const entryTokens = entryTokenMaps.get(entry.id);
    if (!entryTokens) continue;

    const { score, tokenMatches } = scoreKeywordEntry(queryTokens, entryTokens);
    if (tokenMatches.length > 0) {
      candidates.push({
        entry,
        channel: 'keyword',
        score,
        tokenMatches,
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}

export const keywordChannel: KnowledgeReadRecallChannel = {
  name: 'keyword',
  async recall(queryText: string, entries: KnowledgeRecord[]) {
    return keywordRecall(queryText, entries);
  },
};
