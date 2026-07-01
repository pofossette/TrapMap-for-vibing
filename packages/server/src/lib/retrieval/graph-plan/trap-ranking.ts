import type { ParsedIntent } from '@trapmap/server/lib/retrieval/types.js';
import type { KnowledgeRecord } from '@trapmap/server/lib/store.js';

export interface RankedTrapSeed {
  entry: KnowledgeRecord;
  score: number;
}

const MIN_TRAP_SCORE = 0.18;
const MAX_TRAP_SEEDS = 8;

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2),
  );
}

function textSimilarity(query: string, target: string): number {
  const queryTokens = tokenize(query);
  const targetTokens = tokenize(target);

  if (queryTokens.size === 0 || targetTokens.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const token of queryTokens) {
    if (targetTokens.has(token)) {
      overlap++;
    }
  }

  return overlap / Math.sqrt(queryTokens.size * targetTokens.size);
}

function scoreTrapEntry(intent: ParsedIntent, entry: KnowledgeRecord): number {
  const entryText = `${entry.shortcut} ${entry.detail} ${entry.labels.join(' ')}`;

  const situationScore = intent.situation ? textSimilarity(intent.situation, entryText) : 0;

  const problemText = [intent.problem, intent.errorText].filter(Boolean).join(' ').trim();
  const problemScore = problemText
    ? textSimilarity(problemText, entryText)
    : textSimilarity(intent.normalized, entryText);

  const goalScore = intent.goal ? textSimilarity(intent.goal, entryText) : 0;

  let keywordScore = 0;
  if (intent.tokens.length > 0) {
    const entryLower = entryText.toLowerCase();
    let matchCount = 0;
    for (const token of intent.tokens) {
      if (entryLower.includes(token.token)) {
        matchCount++;
      }
    }
    keywordScore = matchCount / intent.tokens.length;
  }

  let stackPathBoost = 1.0;
  if (intent.stackPathHints.length > 0) {
    const entryLower = entryText.toLowerCase();
    let matchCount = 0;
    for (const hint of intent.stackPathHints) {
      if (entryLower.includes(hint.hint.toLowerCase())) {
        matchCount++;
      }
    }
    stackPathBoost = 1.0 + (matchCount / intent.stackPathHints.length) * 0.5;
  }

  const baseScore =
    problemScore * 0.3 +
    situationScore * 0.21 +
    goalScore * 0.17 +
    keywordScore * 0.17 +
    textSimilarity(intent.normalized, entryText) * 0.15;

  return Math.min(1, baseScore * stackPathBoost);
}

function rankTrapCandidates(entries: KnowledgeRecord[], intent: ParsedIntent): RankedTrapSeed[] {
  const scored: RankedTrapSeed[] = [];

  for (const entry of entries) {
    const score = scoreTrapEntry(intent, entry);
    scored.push({ entry, score });
  }

  scored.sort((a, b) => b.score - a.score);

  return scored;
}

export function selectQueryRelevantTraps(
  entries: KnowledgeRecord[],
  intent: ParsedIntent,
): RankedTrapSeed[] {
  return rankTrapCandidates(entries, intent)
    .filter((candidate) => candidate.score >= MIN_TRAP_SCORE)
    .slice(0, MAX_TRAP_SEEDS);
}
