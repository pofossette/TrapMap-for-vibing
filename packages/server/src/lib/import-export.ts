import type { AgentReviewResult, KnowledgeSubmission } from '@skill-shareer/contracts';

import { createKnowledgeEntryRecord } from './knowledge.js';
import type { JsonStore, KnowledgeRecord, StoreData } from './store.js';

/**
 * Parses a SKILL.md format content with YAML frontmatter.
 * Extracts name as shortcut and description as detail.
 * Returns null if parsing fails.
 */
export function parseClaudeSkill(content: string): KnowledgeSubmission | null {
  // Match frontmatter between --- markers
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);

  if (!frontmatterMatch) {
    return null;
  }

  const match = frontmatterMatch;
  if (!match || !match[1] || !match[2]) {
    return null;
  }

  const frontmatterRaw = match[1];
  const body = match[2];

  // Simple YAML parsing for the fields we care about
  const lines = frontmatterRaw.split('\n');
  const frontmatter: Record<string, string> = {};

  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim();

    // Remove quotes if present
    const unquoted = value.replace(/^["']|["']$/g, '');
    frontmatter[key] = unquoted;
  }

  const name = frontmatter['name'];
  if (!name) {
    return null;
  }

  const description = frontmatter['description'] ?? '';
  const detailContent = body.trim() || description;

  return {
    scope: 'project',
    labels: ['imported', 'skill'],
    shortcut: name,
    detail: detailContent,
  };
}

/**
 * Detects potential duplicate entries by:
 * - Identical shortcut (case-insensitive)
 * - Detail similarity > 0.8 using word overlap
 */
export function detectDuplicates(
  entry: KnowledgeSubmission,
  existing: KnowledgeRecord[],
): KnowledgeRecord[] {
  const duplicates: KnowledgeRecord[] = [];
  const entryShortcutLower = entry.shortcut.toLowerCase();
  const entryTokens = tokenize(entry.detail);

  for (const record of existing) {
    // Check shortcut match (case-insensitive)
    if (record.shortcut.toLowerCase() === entryShortcutLower) {
      duplicates.push(record);
      continue;
    }

    // Check detail similarity
    const recordTokens = tokenize(record.detail);
    const similarity = overlapScore(entryTokens, recordTokens);

    if (similarity > 0.8) {
      duplicates.push(record);
    }
  }

  return duplicates;
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((part) => part.length >= 3),
  );
}

function overlapScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) {
    return 0;
  }

  let shared = 0;

  for (const token of a) {
    if (b.has(token)) {
      shared += 1;
    }
  }

  return shared / new Set([...a, ...b]).size;
}

/**
 * Creates a knowledge entry record from an import.
 * Sets lifecycle state based on preReview status.
 */
export function createImportedEntry(args: {
  store: JsonStore;
  data: StoreData;
  ownerUserId: string;
  teamId: string | null;
  payload: KnowledgeSubmission;
  requestedLevel: number;
  source: 'json' | 'claude-skill';
  createdAt: string;
  preReview: AgentReviewResult;
}): KnowledgeRecord {
  return createKnowledgeEntryRecord({
    store: args.store,
    data: args.data,
    ownerUserId: args.ownerUserId,
    teamId: args.teamId,
    payload: args.payload,
    requiredLevel: args.requestedLevel,
    createdAt: args.createdAt,
    preReview: args.preReview,
  });
}
