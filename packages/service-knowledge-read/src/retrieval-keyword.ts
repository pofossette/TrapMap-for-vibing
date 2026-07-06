import type { KnowledgeReadRecallChannel } from './retrieval-orchestration.js';
import type { RecallCandidate, TokenMatchDetail } from './retrieval-types.js';
import type { KnowledgeRecord } from './store.js';

export function tokenize(text: string): string[] {
  const normalized = text.toLowerCase();
  const rawTokens = normalized.split(/[^a-z0-9]+/g);
  const tokenSet = new Set<string>();

  for (const token of rawTokens) {
    if (token.length > 0) {
      tokenSet.add(token);
    }
  }

  return Array.from(tokenSet);
}

export function normalizeQuery(query: string): string[] {
  const tokens = tokenize(query);
  return tokens.filter((t) => t.length >= 2);
}

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
    shortcut: new Set(tokenize(entry.shortcut)),
    detail: new Set(tokenize(entry.detail)),
    labels: new Set(tokenize(entry.labels.join(' '))),
  };
}

function scoreEntry(
  queryTokens: string[],
  _entry: KnowledgeRecord,
  entryTokens: {
    shortcut: Set<string>;
    detail: Set<string>;
    labels: Set<string>;
  },
): { score: number; tokenMatches: TokenMatchDetail[] } {
  if (queryTokens.length === 0) {
    return { score: 0, tokenMatches: [] };
  }

  const tokenMatches: TokenMatchDetail[] = [];
  const LABEL_WEIGHT = 3.0;
  const SHORTCUT_WEIGHT = 2.0;
  const DETAIL_WEIGHT = 1.0;

  let totalWeightedScore = 0;
  let maxPossibleScore = 0;

  for (const token of queryTokens) {
    const fields: TokenMatchDetail['fields'] = [];
    let tokenScore = 0;

    if (entryTokens.labels.has(token)) {
      tokenScore += LABEL_WEIGHT;
      fields.push('labels');
    }
    if (entryTokens.shortcut.has(token)) {
      tokenScore += SHORTCUT_WEIGHT;
      fields.push('shortcut');
    }
    if (entryTokens.detail.has(token)) {
      tokenScore += DETAIL_WEIGHT;
      fields.push('detail');
    }

    if (fields.length > 0) {
      tokenMatches.push({ token, fields });
    }

    totalWeightedScore += tokenScore;
    maxPossibleScore += LABEL_WEIGHT + SHORTCUT_WEIGHT + DETAIL_WEIGHT;
  }

  const score = maxPossibleScore > 0 ? totalWeightedScore / maxPossibleScore : 0;

  return {
    score: Math.min(1, Math.max(0, score)),
    tokenMatches,
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

    const { score, tokenMatches } = scoreEntry(queryTokens, entry, entryTokens);
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
