/**
 * Knowledge-read bounded context — tokenization / keyword scoring rules.
 *
 * Pure text tokenization and keyword scoring weights with zero framework,
 * DB or I/O imports. The recall channels (in-memory and PostgreSQL keyword
 * recall) render these rules; the tokenizer itself is shared by the
 * embedding and graph recall channels.
 */

export interface TokenMatchDetailLike {
  token: string;
  fields: Array<'shortcut' | 'detail' | 'labels'>;
}

/** Tokenize free text into lowercased alphanumeric tokens. */
export function tokenizeText(text: string): string[] {
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

/** Query tokens, dropping single-character noise tokens. */
export function normalizeQuery(query: string): string[] {
  const tokens = tokenizeText(query);
  return tokens.filter((t) => t.length >= 2);
}

// ---------------------------------------------------------------------------
// Keyword scoring weights
// ---------------------------------------------------------------------------

export const KEYWORD_LABEL_WEIGHT = 3.0;
export const KEYWORD_SHORTCUT_WEIGHT = 2.0;
export const KEYWORD_DETAIL_WEIGHT = 1.0;

/**
 * Score a keyword candidate from its per-field token sets.
 * Returns a normalized 0..1 score and the matched token fields.
 */
export function scoreKeywordEntry(
  queryTokens: string[],
  entryTokens: {
    shortcut: Set<string>;
    detail: Set<string>;
    labels: Set<string>;
  },
): { score: number; tokenMatches: TokenMatchDetailLike[] } {
  if (queryTokens.length === 0) {
    return { score: 0, tokenMatches: [] };
  }

  const tokenMatches: TokenMatchDetailLike[] = [];
  const maxFieldScore = KEYWORD_LABEL_WEIGHT + KEYWORD_SHORTCUT_WEIGHT + KEYWORD_DETAIL_WEIGHT;

  let totalWeightedScore = 0;
  let maxPossibleScore = 0;

  for (const token of queryTokens) {
    const fields: TokenMatchDetailLike['fields'] = [];
    let tokenScore = 0;

    if (entryTokens.labels.has(token)) {
      tokenScore += KEYWORD_LABEL_WEIGHT;
      fields.push('labels');
    }
    if (entryTokens.shortcut.has(token)) {
      tokenScore += KEYWORD_SHORTCUT_WEIGHT;
      fields.push('shortcut');
    }
    if (entryTokens.detail.has(token)) {
      tokenScore += KEYWORD_DETAIL_WEIGHT;
      fields.push('detail');
    }

    if (fields.length > 0) {
      tokenMatches.push({ token, fields });
    }

    totalWeightedScore += tokenScore;
    maxPossibleScore += maxFieldScore;
  }

  const score = maxPossibleScore > 0 ? totalWeightedScore / maxPossibleScore : 0;

  return {
    score: Math.min(1, Math.max(0, score)),
    tokenMatches,
  };
}
