import { createHash, randomUUID } from 'node:crypto';
import type { AgentReviewResult, ArtifactBundle, KnowledgeSubmission } from '@trapmap/contracts';
import { parseSkillMarkdown, validateRelativePath } from '@trapmap/contracts';

import { createKnowledgeEntryRecord } from './knowledge.js';
import type {
  ArtifactFilePayloadRecord,
  KnowledgeRecord,
  SkillArtifactRevisionRecord,
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

  // Validate sourceKind-specific constraints (T-13-05, T-13-06)
  if (bundle.sourceKind === 'single-skill-md') {
    // Single-file mode: exactly one SKILL.md file, no other files
    if (bundle.files.length !== 1) {
      throw new Error(
        `single-skill-md imports must contain exactly one file, got ${bundle.files.length}`,
      );
    }
    const onlyFile = bundle.files[0];
    if (!onlyFile || onlyFile.path !== 'SKILL.md') {
      throw new Error(
        `single-skill-md imports must contain only SKILL.md at root, got "${onlyFile?.path ?? 'unknown'}"`,
      );
    }
    // No script descriptors for single-file mode
    if (bundle.scriptDescriptors.length > 0) {
      throw new Error(
        `single-skill-md imports cannot contain script descriptors, got ${bundle.scriptDescriptors.length}`,
      );
    }
  }

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
  const metadata = parseSkillMarkdown(content);
  if (!metadata.hasFrontmatter || !metadata.name) {
    return null;
  }

  const detailContent = metadata.body.trim() || metadata.description || '';

  return {
    scope: 'project',
    labels: ['imported', 'skill'],
    shortcut: metadata.name,
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
  ownerUserId: string;
  teamId: string | null;
  payload: KnowledgeSubmission;
  requestedLevel: number;
  source: 'json' | 'claude-skill';
  createdAt: string;
  preReview: AgentReviewResult;
}): KnowledgeRecord {
  return createKnowledgeEntryRecord({
    ownerUserId: args.ownerUserId,
    teamId: args.teamId,
    payload: args.payload,
    requiredLevel: args.requestedLevel,
    createdAt: args.createdAt,
    preReview: args.preReview,
    entryId: `knowledge_${randomUUID()}`,
  });
}

/**
 * Migration provenance record linking artifacts to legacy entries.
 * Stored on artifact metadata to trace migration source.
 */
interface LegacyMigrationProvenance {
  /** Source legacy entry ID */
  sourceEntryId: string;
  /** Original lifecycle state at migration time */
  sourceLifecycleState: string;
  /** Whether the artifact inherited approval status from the legacy entry */
  inheritedApproval: boolean;
  /** Migration timestamp */
  migratedAt: string;
}

/**
 * Builds a minimal SKILL.md content from a legacy knowledge entry.
 * Normalizes shortcut as title and detail as body.
 * T-16-01 mitigation: preserves labels, scope, requiredLevel without inventing content.
 */
function buildMinimalSkillMdContent(args: {
  shortcut: string;
  detail: string;
  labels: string[];
  scope: 'global' | 'project';
  requiredLevel: number;
}): string {
  const { shortcut, detail, labels, scope, requiredLevel } = args;

  // Build frontmatter with legacy metadata
  const frontmatter = {
    name: shortcut,
    labels: labels.join(', '),
    scope,
    requiredLevel,
    migratedFromLegacy: true,
  };

  // Format frontmatter as YAML
  const frontmatterLines = ['---'];
  for (const [key, value] of Object.entries(frontmatter)) {
    if (Array.isArray(value)) {
      frontmatterLines.push(`${key}: ${value.join(', ')}`);
    } else {
      frontmatterLines.push(`${key}: ${value}`);
    }
  }
  frontmatterLines.push('---');

  // Combine frontmatter and body
  return `${frontmatterLines.join('\n')}\n\n${detail}`;
}

/**
 * Migrates a single legacy knowledge record to a minimal artifact bundle.
 * Produces a single-file SKILL.md artifact without inventing references/assets/scripts.
 *
 * ARTF-04: Legacy entries become minimal skill artifacts.
 * T-16-01 mitigation: Normalizes from explicit legacy fields only.
 */
export function migrateLegacyEntryToArtifactBundle(args: {
  legacyEntry: KnowledgeRecord;
}): ArtifactBundle {
  const { legacyEntry } = args;

  // Build minimal SKILL.md content
  const skillMdContent = buildMinimalSkillMdContent({
    shortcut: legacyEntry.shortcut,
    detail: legacyEntry.detail,
    labels: legacyEntry.labels,
    scope: legacyEntry.scope,
    requiredLevel: legacyEntry.requiredLevel,
  });

  // Compute hash for SKILL.md
  const sha256 = computeHash(skillMdContent);
  const sizeBytes = Buffer.byteLength(skillMdContent, 'utf8');

  // Generate slug from shortcut
  const slug = legacyEntry.shortcut
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  // Build minimal artifact bundle (SKILL.md only)
  return {
    scope: legacyEntry.scope,
    labels: legacyEntry.labels,
    title: legacyEntry.shortcut,
    slug,
    requiredLevel: legacyEntry.requiredLevel,
    sourceKind: 'legacy-knowledge',
    files: [
      {
        path: 'SKILL.md',
        kind: 'skill-markdown',
        sha256,
        sizeBytes,
        mediaType: 'text/markdown',
        source: 'SKILL.md',
        includeInDerivation: true,
        activationOnly: false,
        content: skillMdContent,
      },
    ],
    scriptDescriptors: [],
  };
}

/**
 * Validates that a legacy entry can be migrated.
 * Returns error reason if migration should be rejected.
 */
export function validateLegacyEntryMigration(args: {
  legacyEntry: KnowledgeRecord;
  existingArtifactIds: Set<string>;
}): { valid: boolean; reason: string | null } {
  const { legacyEntry } = args;
  // Note: existingArtifactIds would be used for full provenance tracking

  // Entry must be in a valid lifecycle state for migration
  const validStates = ['approved', 'agent-pass', 'agent-rejected'];
  if (!validStates.includes(legacyEntry.lifecycleState)) {
    return {
      valid: false,
      reason: `Invalid lifecycle state: ${legacyEntry.lifecycleState}`,
    };
  }

  return { valid: true, reason: null };
}
