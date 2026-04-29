/**
 * Fingerprint computation for candidate submissions.
 * Provides deterministic hashing and text analysis for duplicate detection.
 *
 * @module candidates/fingerprint
 */

import { createHash } from 'node:crypto';

import type { AnalysisSnapshot } from '@trapmap/contracts';

import { nowIso } from '../store.js';
import type { CandidateFingerprintInput } from './types.js';

/**
 * Tokenize text into significant words.
 * Matches the pattern from pre-review.ts for consistency.
 */
export function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((part) => part.length >= 3),
  );
}

/**
 * Extract keywords from text (more selective than tokens).
 * Looks for capitalized terms, quoted phrases, and technical identifiers.
 */
export function extractKeywords(text: string): string[] {
  const keywords: string[] = [];

  // Extract capitalized phrases (likely proper nouns)
  const capitalized = text.match(/\b[A-Z][a-zA-Z]+\b/g) ?? [];
  keywords.push(...capitalized);

  // Extract quoted phrases
  const quoted = text.match(/"([^"]+)"/g) ?? [];
  keywords.push(...quoted.map((q) => q.replace(/"/g, '')));

  // Extract code-like identifiers (camelCase, snake_case, kebab-case)
  const identifiers = text.match(/\b[a-z]+[a-zA-Z0-9_/-]+\b/g) ?? [];
  keywords.push(...identifiers.filter((id) => id.length >= 4));

  return [...new Set(keywords)];
}

/**
 * Compute fingerprint for a trap submission.
 * Hashes shortcut + detail + sorted labels.
 */
export function computeTrapFingerprint(payload: {
  shortcut: string;
  detail: string;
  labels: string[];
}): string {
  const content = [payload.shortcut, payload.detail, [...payload.labels].sort().join(',')].join(
    '\n',
  );

  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Compute fingerprint for a skill submission.
 * Uses file hashes and profile summary.
 */
export function computeSkillFingerprint(payload: {
  profile: { title: string; summary: string; keywords: string[] } | null;
  files: Array<{ path: string; sha256: string }>;
}): string {
  const parts: string[] = [];

  if (payload.profile) {
    parts.push(payload.profile.title);
    parts.push(payload.profile.summary);
    parts.push(...payload.profile.keywords.sort());
  }

  // Include sorted file hashes for deterministic fingerprint
  const fileHashes = payload.files
    .map((f) => f.sha256)
    .sort()
    .join(',');
  parts.push(fileHashes);

  return createHash('sha256').update(parts.join('\n'), 'utf8').digest('hex');
}

/**
 * Compute fingerprint and analysis snapshot for a candidate.
 */
export function computeCandidateFingerprint(input: CandidateFingerprintInput): {
  fingerprint: string;
  keywords: string[];
  tokens: string[];
} {
  let fingerprint: string;
  let keywords: string[] = [];
  let tokens: string[] = [];

  if (input.sourceType === 'trap' && input.trapPayload) {
    fingerprint = computeTrapFingerprint(input.trapPayload);
    const fullText = `${input.trapPayload.shortcut}\n${input.trapPayload.detail}`;
    keywords = extractKeywords(fullText);
    keywords.push(...input.trapPayload.labels);
    tokens = [...tokenize(fullText)];
  } else if (input.sourceType === 'skill' && input.skillPayload) {
    fingerprint = computeSkillFingerprint(input.skillPayload);
    if (input.skillPayload.profile) {
      keywords = [...input.skillPayload.profile.keywords];
      tokens = [...tokenize(input.skillPayload.profile.summary)];
    }
  } else {
    throw new Error(`Invalid fingerprint input for source type: ${input.sourceType}`);
  }

  return {
    fingerprint,
    keywords: [...new Set(keywords)],
    tokens: [...new Set(tokens)],
  };
}

/**
 * Create analysis snapshot from fingerprint computation.
 */
export function createAnalysisSnapshot(
  fingerprint: string,
  keywords: string[],
  tokens: string[],
): AnalysisSnapshot {
  return {
    normalizedAt: nowIso(),
    fingerprint,
    keywords,
    tokens,
  };
}
