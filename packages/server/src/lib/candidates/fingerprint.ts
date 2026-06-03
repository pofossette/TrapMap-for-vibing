/**
 * Fingerprint computation for candidate submissions.
 * Provides deterministic hashing and text analysis for duplicate detection.
 *
 * @module candidates/fingerprint
 */

import { createHash } from 'node:crypto';

import type { AnalysisSnapshot, CandidateSubmission } from '@trapmap/contracts';

import { nowIso } from '@trapmap/server/lib/store.js';
import type { CandidateFingerprintInput, NormalizedDuplicateInput } from './types.js';

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
 * Hashes shortcut + detail + sorted, trimmed labels.
 * Whitespace is trimmed and label order is normalized so equivalent
 * payloads produce the same fingerprint.
 */
export function computeTrapFingerprint(payload: {
  shortcut: string;
  detail: string;
  labels: string[];
}): string {
  const content = [
    payload.shortcut.trim(),
    payload.detail.trim(),
    payload.labels
      .map((l) => l.trim())
      .sort()
      .join(','),
  ].join('\n');

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

// ---------------------------------------------------------------------------
// Phase 2: shared normalized candidate input
// ---------------------------------------------------------------------------

/**
 * Minimal shape of a skill candidate file entry the normalization helper
 * can consume. The strict contract `SkillBundleFileMetadataSchema` only
 * requires `path`, `sha256`, `sizeBytes`, and `mediaType`; we also accept
 * the optional `content` / `text` fields so SKILL.md content (when
 * present, e.g. via a richer upstream payload) can be parsed for a real
 * title and summary at submission time.
 */
export interface CandidateSkillFileEntry {
  path: string;
  sha256?: string;
  sizeBytes?: number;
  mediaType?: string;
  content?: string;
  text?: string;
}

/**
 * Minimal shape of a skill candidate payload the normalization helper
 * can consume.
 */
export interface CandidateSkillPayloadShape {
  files: CandidateSkillFileEntry[];
}

/**
 * Lightweight profile derived from a skill candidate submission.
 * Returned by `extractCandidateSkillProfile` when a SKILL.md is present
 * and parsable. The shape mirrors the parts of `DerivedSkillProfileRecord`
 * that the candidate-time normalizer actually has access to (no
 * `artifactId` / `revision` yet — those are assigned post-approval).
 */
export interface CandidateSkillProfile {
  title: string;
  summary: string;
  keywords: string[];
}

/**
 * Extract a normalized title/summary/keywords profile from a skill
 * candidate submission. Returns `null` when no profile can be derived.
 *
 * Heuristic (Phase 2):
 * - Look for a file with `path === 'SKILL.md'` (or whose basename is `SKILL.md`).
 * - If that file carries a `content` or `text` field, parse the first
 *   markdown `#` heading as the title and the remaining text as the
 *   summary. If no heading is present, fall back to the first non-empty
 *   line as the title.
 * - If no content is available (the typical case for `originalPayload.skill`
 *   which only carries sha256 metadata) return `null` and let the caller
 *   fall back to file paths.
 *
 * Safe to call on any skill candidate — never throws on missing data.
 */
export function extractCandidateSkillProfile(
  skill: CandidateSkillPayloadShape,
): CandidateSkillProfile | null {
  if (!skill || !Array.isArray(skill.files) || skill.files.length === 0) {
    return null;
  }

  const skillFile = skill.files.find((file) => {
    if (typeof file?.path !== 'string') return false;
    if (file.path === 'SKILL.md') return true;
    const segments = file.path.split('/');
    return segments[segments.length - 1] === 'SKILL.md';
  });

  if (!skillFile) return null;

  const rawContent = skillFile.content ?? skillFile.text;
  if (typeof rawContent !== 'string' || rawContent.length === 0) {
    return null;
  }

  const lines = rawContent.split(/\r?\n/);
  let title = '';
  let bodyStartIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim() ?? '';
    if (line.length === 0) continue;
    const headingMatch = line.match(/^#\s+(.+)$/);
    if (headingMatch) {
      title = headingMatch[1]?.trim() ?? '';
      bodyStartIndex = i + 1;
    } else {
      title = line;
      bodyStartIndex = i + 1;
    }
    break;
  }

  if (title.length === 0) return null;

  const summary = lines.slice(bodyStartIndex).join('\n').trim();
  const keywords = extractKeywords(`${title}\n${summary}`);

  return { title, summary, keywords };
}

/**
 * Build the shared normalized duplicate input for a candidate submission.
 *
 * Produces a `NormalizedDuplicateInput` for both trap and skill candidates
 * so the in-memory and PostgreSQL detectors consume the same fields.
 *
 * Trap candidates:
 * - fingerprint / exactLookupKey: `computeTrapFingerprint({shortcut, detail, labels})`
 * - titleText: shortcut
 * - bodyText: detail
 * - keywordTerms: labels (in original order)
 * - tokenTerms: tokens of `${shortcut}\n${detail}`
 *
 * Skill candidates:
 * - fingerprint / exactLookupKey: `computeSkillFingerprint({profile, files})`
 *   with `profile` derived from SKILL.md content when available, else `null`
 * - titleText: derived profile title, else first file path, else candidate id
 * - bodyText: derived profile summary, else joined file paths
 * - keywordTerms: derived profile keywords when available, else empty
 * - tokenTerms: tokens of the bodyText
 */
export function buildNormalizedDuplicateInput(
  candidate: CandidateSubmission,
): NormalizedDuplicateInput {
  if (candidate.sourceType === 'trap' && candidate.originalPayload.trap) {
    const trap = candidate.originalPayload.trap;
    const fingerprint = computeTrapFingerprint(trap);
    const fullText = `${trap.shortcut}\n${trap.detail}`;
    return {
      sourceType: 'trap',
      fingerprint,
      titleText: trap.shortcut,
      bodyText: trap.detail,
      keywordTerms: [...trap.labels],
      tokenTerms: [...tokenize(fullText)],
      exactLookupKey: fingerprint,
    };
  }

  const skill = candidate.originalPayload.skill;
  if (!skill) {
    throw new Error(
      `Cannot build normalized duplicate input for candidate ${candidate.id}: missing skill payload`,
    );
  }

  const profile = extractCandidateSkillProfile(skill);
  const fingerprint = computeSkillFingerprint({
    profile: profile
      ? { title: profile.title, summary: profile.summary, keywords: profile.keywords }
      : null,
    files: skill.files.map((file) => ({ path: file.path, sha256: file.sha256 })),
  });

  const titleText = profile?.title ?? skill.files[0]?.path ?? candidate.id;
  const bodyText = profile?.summary ?? skill.files.map((file) => file.path).join('\n');
  const keywordTerms = profile?.keywords ?? [];
  const tokenTerms = [...tokenize(bodyText)];

  return {
    sourceType: 'skill',
    fingerprint,
    titleText,
    bodyText,
    keywordTerms,
    tokenTerms,
    exactLookupKey: fingerprint,
  };
}
