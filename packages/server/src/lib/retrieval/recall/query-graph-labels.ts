import { tokenize } from '@trapmap/server/lib/retrieval/recall/keyword.js';

const MIN_LABEL_LENGTH = 2;

const STOP_WORDS = new Set([
  'the',
  'and',
  'to',
  'for',
  'with',
  'from',
  'into',
  'onto',
  'about',
  'this',
  'that',
  'have',
  'has',
  'had',
  'was',
  'were',
  'will',
  'would',
  'should',
  'could',
  'need',
  'needs',
  'using',
  'use',
  'used',
  'make',
  'made',
  'get',
  'got',
  'how',
  'why',
  'what',
  'when',
  'where',
  'which',
]);

export function normalizeQueryGraphLabels(queryText: string): Set<string> {
  if (!queryText || queryText.trim().length === 0) {
    return new Set();
  }

  const labels = new Set<string>();
  for (const token of tokenize(queryText)) {
    if (token.length < MIN_LABEL_LENGTH) {
      continue;
    }
    if (STOP_WORDS.has(token)) {
      continue;
    }
    labels.add(token);
  }

  return labels;
}
