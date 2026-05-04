/**
 * CLI-local artifact bundle utilities.
 *
 * Provides:
 * - SKILL.md and skill directory parsing
 * - Canonical artifact bundle construction
 * - File content detection and encoding
 *
 * Extracted from operations.ts for Phase 85 refactoring.
 */

import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { ArtifactBundle, KnowledgeListResponse } from '@trapmap/contracts';
import { detectMediaType, isTextLikeMediaType, parseSkillMarkdown } from '@trapmap/contracts';

/**
 * Checks if a file path is a SKILL.md file (basename check).
 */
export function isSkillMdFile(filePath: string): boolean {
  const basename = filePath.split('/').pop() ?? filePath;
  const basenameLower = basename.toLowerCase();
  return basenameLower === 'skill.md';
}

/**
 * Builds a minimal artifact bundle from a single SKILL.md file.
 * Used for single-skill-md compatibility import (IMEX-03).
 */
export async function buildSingleSkillMdBundle(args: {
  filePath: string;
  requestedLevel: number;
}): Promise<ArtifactBundle> {
  const { filePath, requestedLevel } = args;

  // Read SKILL.md content
  const content = await readFile(filePath, 'utf8');
  const buffer = await readFile(filePath);
  const sha256 = createHash('sha256').update(buffer).digest('hex');

  // Parse metadata from frontmatter
  const metadata = parseSkillMetadata(content);
  const title = metadata?.title ?? 'Untitled Skill';
  const labels = metadata?.labels ?? ['imported'];

  // Generate slug from title
  const slug = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  return {
    scope: 'project',
    labels,
    title,
    slug,
    requiredLevel: requestedLevel,
    sourceKind: 'single-skill-md',
    files: [
      {
        path: 'SKILL.md',
        kind: 'skill-markdown',
        sha256,
        sizeBytes: buffer.length,
        mediaType: 'text/markdown',
        source: 'SKILL.md',
        includeInDerivation: true,
        activationOnly: false,
        content: content, // Text content, not base64
      },
    ],
    scriptDescriptors: [],
  };
}

/**
 * Parses a SKILL.md format content with YAML frontmatter.
 * Extracts name as shortcut and description as detail.
 * Returns null if parsing fails.
 */
export function parseClaudeSkill(
  content: string,
): { shortcut: string; detail: string; scope: string; labels: string[] } | null {
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
 * Computes SHA-256 hash of file content.
 */
export function computeFileHash(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Recursively scans a directory for skill files.
 * Returns SKILL.md, references/, assets/, and scripts/ files.
 */
export async function scanSkillDirectory(
  rootPath: string,
): Promise<{ skillMd: string | null; references: string[]; assets: string[]; scripts: string[] }> {
  const references: string[] = [];
  const assets: string[] = [];
  const scripts: string[] = [];

  // Manual recursive scan to correctly handle nested paths
  async function scanDir(dirPath: string) {
    try {
      const entries = await readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name);
        const relPath = relative(rootPath, fullPath);

        // Skip hidden files and node_modules
        if (relPath.startsWith('.') || relPath.includes('node_modules')) {
          continue;
        }

        if (entry.isFile()) {
          // Classify file by directory
          if (relPath === 'SKILL.md') {
            // Will be handled separately
          } else if (relPath.startsWith('references/')) {
            references.push(relPath);
          } else if (relPath.startsWith('assets/')) {
            assets.push(relPath);
          } else if (relPath.startsWith('scripts/')) {
            scripts.push(relPath);
          }
        } else if (entry.isDirectory()) {
          // Recursively scan subdirectories
          await scanDir(fullPath);
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  await scanDir(rootPath);

  // Check for SKILL.md at root
  try {
    const skillMdPath = join(rootPath, 'SKILL.md');
    await readFile(skillMdPath);
    return { skillMd: skillMdPath, references, assets, scripts };
  } catch {
    return { skillMd: null, references, assets, scripts };
  }
}

/**
 * Reads a file and returns its content encoded for transport.
 * Text files are returned as UTF-8 strings, binary files as base64.
 */
export async function readFileContent(path: string): Promise<{ content: string; isBinary: boolean }> {
  const buffer = await readFile(path);
  const mimeType = detectMediaType(path);

  if (isTextLikeMediaType(mimeType)) {
    return { content: buffer.toString('utf8'), isBinary: false };
  }

  // Otherwise return as base64
  return { content: buffer.toString('base64'), isBinary: true };
}

/**
 * Parses SKILL.md frontmatter to extract metadata.
 */
export function parseSkillMetadata(content: string): { title: string; labels: string[] } | null {
  const metadata = parseSkillMarkdown(content);
  const title = metadata.title ?? metadata.name;
  if (!metadata.hasFrontmatter || !title) {
    return null;
  }

  return {
    title,
    labels: metadata.labels.length > 0 ? metadata.labels : ['imported'],
  };
}

/**
 * Builds a canonical artifact bundle from a local skill directory.
 */
export async function buildArtifactBundle(args: {
  rootPath: string;
  requestedLevel: number;
  sourceKind: 'skill-directory' | 'single-skill-md';
}): Promise<ArtifactBundle> {
  const { rootPath, requestedLevel, sourceKind } = args;

  // Scan directory for files
  const { skillMd, references, assets, scripts } = await scanSkillDirectory(rootPath);

  if (!skillMd && sourceKind === 'skill-directory') {
    throw new Error('SKILL.md not found in directory');
  }

  // Read SKILL.md for metadata
  let title = 'Untitled Skill';
  let labels = ['imported'];
  let slug = 'untitled-skill';

  if (skillMd) {
    const skillMdContent = await readFile(skillMd, 'utf8');
    const metadata = parseSkillMetadata(skillMdContent);
    if (metadata) {
      title = metadata.title;
      labels = metadata.labels;
      // Generate slug from title
      slug = title
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
    }
  }

  // Read all files and build bundle
  const files: ArtifactBundle['files'] = [];

  // Add SKILL.md
  if (skillMd) {
    const { content, isBinary } = await readFileContent(skillMd);
    const buffer = await readFile(skillMd);
    const sha256 = computeFileHash(buffer);

    files.push({
      path: 'SKILL.md',
      kind: 'skill-markdown',
      sha256,
      sizeBytes: buffer.length,
      mediaType: 'text/markdown',
      source: 'SKILL.md',
      includeInDerivation: true,
      activationOnly: false,
      content: isBinary ? content : content, // Content is already encoded
    });
  }

  // Add references
  for (const relPath of references) {
    const fullPath = join(rootPath, relPath);
    const { content, isBinary } = await readFileContent(fullPath);
    const buffer = await readFile(fullPath);
    const sha256 = computeFileHash(buffer);
    const mediaType = detectMediaType(relPath);

    files.push({
      path: relPath,
      kind: 'reference',
      sha256,
      sizeBytes: buffer.length,
      mediaType,
      source: 'references/',
      includeInDerivation: true,
      activationOnly: false,
      content: isBinary ? content : content,
    });
  }

  // Add assets
  for (const relPath of assets) {
    const fullPath = join(rootPath, relPath);
    const { content, isBinary } = await readFileContent(fullPath);
    const buffer = await readFile(fullPath);
    const sha256 = computeFileHash(buffer);
    const mediaType = detectMediaType(relPath);

    files.push({
      path: relPath,
      kind: 'asset',
      sha256,
      sizeBytes: buffer.length,
      mediaType,
      source: 'assets/',
      includeInDerivation: false,
      activationOnly: true,
      content: isBinary ? content : content,
    });
  }

  // Add scripts
  for (const relPath of scripts) {
    const fullPath = join(rootPath, relPath);
    const { content, isBinary } = await readFileContent(fullPath);
    const buffer = await readFile(fullPath);
    const sha256 = computeFileHash(buffer);
    const mediaType = detectMediaType(relPath);

    files.push({
      path: relPath,
      kind: 'script',
      sha256,
      sizeBytes: buffer.length,
      mediaType,
      source: 'scripts/',
      includeInDerivation: false,
      activationOnly: true,
      content: isBinary ? content : content,
    });
  }

  const scriptHashes = new Map(
    files.filter((file) => file.kind === 'script').map((file) => [file.path, file.sha256]),
  );
  const scriptDescriptors: ArtifactBundle['scriptDescriptors'] = scripts.map((relPath) => {
    const sha256 = scriptHashes.get(relPath);
    if (!sha256) {
      throw new Error(`Missing script hash for ${relPath}`);
    }

    return {
      path: relPath,
      sha256,
      capability: `${relPath} execution`,
      argsSchemaSummary: '',
      sideEffectSummary: '',
      defaultPolicy: 'manual',
    };
  });

  return {
    scope: 'project',
    labels,
    title,
    slug,
    requiredLevel: requestedLevel,
    sourceKind,
    files,
    scriptDescriptors,
  };
}

export function formatListResponse(response: KnowledgeListResponse): string {
  if (response.items.length === 0) {
    return 'No knowledge entries found';
  }

  return response.items
    .map((item) =>
      [
        `${item.id} [${item.lifecycleState}]`,
        `Scope: ${item.scope}`,
        `Required level: ${item.requiredLevel}`,
        `Shortcut: ${item.shortcut}`,
      ].join('\n'),
    )
    .join('\n\n');
}
