import { createHash } from 'node:crypto';
import type {
  AgentReviewResult,
  ArtifactBundle,
  KnowledgeSubmission,
} from '@skill-shareer/contracts';
import { validateRelativePath } from '@skill-shareer/contracts';

import { createKnowledgeEntryRecord } from './knowledge.js';
import type {
  ArtifactFilePayloadRecord,
  JsonStore,
  KnowledgeRecord,
  SkillArtifactRevisionRecord,
  StoreData,
} from './store.js';

/**
 * File kind classification for canonical import.
 * Maps file extensions and paths to canonical kinds.
 */
function classifyFileKind(path: string): 'skill-markdown' | 'reference' | 'asset' | 'script' {
  if (path === 'SKILL.md') {
    return 'skill-markdown';
  }

  if (path.startsWith('scripts/')) {
    return 'script';
  }

  if (path.startsWith('assets/')) {
    return 'asset';
  }

  if (path.startsWith('references/')) {
    return 'reference';
  }

  // Default unknown files to reference
  return 'reference';
}

/**
 * Classifies the source directory for a file path.
 */
function classifyFileSource(path: string): 'references/' | 'assets/' | 'scripts/' | 'SKILL.md' {
  if (path === 'SKILL.md') {
    return 'SKILL.md';
  }

  if (path.startsWith('scripts/')) {
    return 'scripts/';
  }

  if (path.startsWith('assets/')) {
    return 'assets/';
  }

  if (path.startsWith('references/')) {
    return 'references/';
  }

  // Default unknown files to references
  return 'references/';
}

/**
 * Determines if a file should be included in derivation.
 * Only SKILL.md and references/ are derivation-eligible (T-13-02 mitigation).
 */
function isDerivationEligible(path: string): boolean {
  return path === 'SKILL.md' || path.startsWith('references/');
}

/**
 * Determines if a file is activation-only.
 * Assets and scripts are activation-only (T-13-02 mitigation).
 */
function isActivationOnly(path: string): boolean {
  return path.startsWith('assets/') || path.startsWith('scripts/');
}

/**
 * Computes SHA-256 hash of content.
 */
function computeHash(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Computes canonical source hash for an artifact revision.
 * Hash is computed from ordered derivation-eligible files only (SKILL.md + references/).
 * This ensures deterministic derivation caching (T-13-01 mitigation).
 */
function computeSourceHash(files: Array<{ path: string; sha256: string }>): string {
  // Filter to derivation-eligible files only
  const derivationEligible = files.filter((f) => isDerivationEligible(f.path));

  // Sort by path for determinism
  derivationEligible.sort((a, b) => a.path.localeCompare(b.path));

  // Concatenate hashes and compute final hash
  const combined = derivationEligible.map((f) => f.sha256).join('');
  return computeHash(combined);
}

/**
 * Validates and normalizes paths in a bundle for security (T-13-01 mitigation).
 * Throws error if any path is invalid.
 */
function validateBundlePaths(bundle: ArtifactBundle): void {
  for (const file of bundle.files) {
    try {
      validateRelativePath(file.path);
    } catch (error) {
      throw new Error(`Invalid file path "${file.path}": ${error}`);
    }
  }

  for (const descriptor of bundle.scriptDescriptors) {
    try {
      validateRelativePath(descriptor.path);
    } catch (error) {
      throw new Error(`Invalid script path "${descriptor.path}": ${error}`);
    }
  }
}

/**
 * Converts bundle file payloads to canonical artifact file records.
 * Applies path validation, kind classification, and derivation flags.
 */
function convertBundleFiles(bundle: ArtifactBundle): Array<{
  path: string;
  kind: 'skill-markdown' | 'reference' | 'asset' | 'script';
  sha256: string;
  sizeBytes: number;
  mediaType: string;
  source: 'references/' | 'assets/' | 'scripts/' | 'SKILL.md';
  includeInDerivation: boolean;
  activationOnly: boolean;
}> {
  return bundle.files.map((file) => {
    const kind = classifyFileKind(file.path);
    const source = classifyFileSource(file.path);

    return {
      path: file.path,
      kind,
      sha256: file.sha256,
      sizeBytes: file.sizeBytes,
      mediaType: file.mediaType,
      source,
      includeInDerivation: isDerivationEligible(file.path),
      activationOnly: isActivationOnly(file.path),
    };
  });
}

/**
 * Creates file payload storage records from a bundle.
 * These enable round-trip export without server-side filesystem (IMEX-04).
 */
function createFilePayloadRecords(
  artifactId: string,
  revision: number,
  bundle: ArtifactBundle,
  storedAt: string,
): ArtifactFilePayloadRecord[] {
  return bundle.files.map((file) => ({
    artifactId,
    revision,
    path: file.path,
    sha256: file.sha256,
    sizeBytes: file.sizeBytes,
    mediaType: file.mediaType,
    content: file.content,
    storedAt,
  }));
}

/**
 * Normalizes a canonical artifact bundle for persistence.
 * Validates paths, classifies files, computes source hash, and prepares payloads.
 *
 * @param bundle - The artifact bundle to normalize
 * @param artifactId - The artifact ID (for payload records)
 * @param revision - The revision number (for payload records)
 * @param storedAt - The timestamp for payload records
 * @returns Normalized bundle data with computed hash and file records
 * @throws Error if bundle validation fails
 */
export function normalizeArtifactBundle(args: {
  bundle: ArtifactBundle;
  artifactId: string;
  revision: number;
  storedAt: string;
}): {
  sourceHash: string;
  files: SkillArtifactRevisionRecord['files'];
  scriptDescriptors: SkillArtifactRevisionRecord['scriptDescriptors'];
  filePayloads: ArtifactFilePayloadRecord[];
} {
  const { bundle, artifactId, revision, storedAt } = args;

  // Validate all paths for security (T-13-01)
  validateBundlePaths(bundle);

  // Convert bundle files to canonical artifact records
  const files = convertBundleFiles(bundle);

  // Compute canonical source hash from derivation-eligible files
  const sourceHash = computeSourceHash(files);

  // Create script descriptors
  const scriptDescriptors = bundle.scriptDescriptors.map((d) => ({
    path: d.path,
    sha256: d.sha256,
    capability: d.capability,
    argsSchemaSummary: d.argsSchemaSummary,
    sideEffectSummary: d.sideEffectSummary,
    defaultPolicy: d.defaultPolicy,
  }));

  // Create file payload storage records
  const filePayloads = createFilePayloadRecords(artifactId, revision, bundle, storedAt);

  return {
    sourceHash,
    files,
    scriptDescriptors,
    filePayloads,
  };
}

/**
 * Parses a SKILL.md format content with YAML frontmatter.
 * Extracts name as shortcut and description as detail.
 * Returns null if parsing fails.
 * @deprecated Use normalizeArtifactBundle for artifact-native imports
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
 * @deprecated Use artifact-native duplicate detection
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
 * @deprecated Use artifact-native import via normalizeArtifactBundle
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
