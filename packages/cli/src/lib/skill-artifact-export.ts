/**
 * CLI-local skill artifact export utilities.
 *
 * Provides:
 * - skill-dir materialization from canonical bundle export
 * - Safe path validation and writing
 * - JSON output helpers
 *
 * Phase 13: IMEX-02, COMP-01, COMP-02, T-13-11
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, resolve, sep } from 'node:path';

import type { ArtifactBundle, ArtifactExportResponse } from '@trapmap/contracts';

/**
 * Validates that a path is safe for writing.
 * Rejects:
 * - Paths with directory traversal (../)
 * - Paths containing null bytes
 * Allows:
 * - Absolute paths (user explicitly chose the path)
 * - Relative paths within the intended directory
 */
export function validateOutputPath(outputPath: string, intendedDir: string): string {
  // Reject null bytes
  if (outputPath.includes('\0')) {
    throw new Error('Path contains null bytes');
  }

  // Normalize the path
  const normalized = normalize(outputPath);

  // Check for directory traversal
  if (normalized.includes('..')) {
    throw new Error(`Path contains directory traversal: ${outputPath}`);
  }

  // Resolve the output path against the intended directory
  const resolved = resolve(intendedDir, normalized);
  const resolvedBase = resolve(intendedDir) + sep;
  if (resolved !== resolve(intendedDir) && !resolved.startsWith(resolvedBase)) {
    throw new Error(`Path escapes intended directory: ${outputPath}`);
  }
  return resolved;
}

/**
 * Validates a relative path from a bundle file.
 * Ensures the path doesn't escape the output directory.
 */
export function validateBundleFilePath(relPath: string): string {
  // Reject null bytes
  if (relPath.includes('\0')) {
    throw new Error(`File path contains null bytes: ${relPath}`);
  }

  // Reject directory traversal
  if (relPath.includes('..')) {
    throw new Error(`File path contains directory traversal: ${relPath}`);
  }

  // Reject absolute paths
  if (relPath.startsWith('/') || /^[A-Za-z]:/.test(relPath)) {
    throw new Error(`File path is absolute: ${relPath}`);
  }

  return normalize(relPath);
}

/**
 * Decodes file content from the transport format.
 * Base64 content is decoded to Buffer, text content is kept as string.
 */
export function decodeFileContent(content: string): Buffer {
  // Try to detect if content is base64-encoded
  // Base64 content should only contain valid base64 characters
  const isBase64 = /^[A-Za-z0-9+/]*={0,2}$/.test(content) && content.length % 4 === 0;

  if (isBase64 && content.length > 0) {
    try {
      return Buffer.from(content, 'base64');
    } catch {
      // Fall through to treat as UTF-8 text
    }
  }

  // Treat as UTF-8 text
  return Buffer.from(content, 'utf8');
}

/**
 * Materializes a skill directory from a canonical artifact bundle.
 * Creates the standard directory structure:
 * - SKILL.md at root
 * - references/ for reference files
 * - assets/ for asset files
 * - scripts/ for script files
 *
 * Omits private sidecar metadata by default.
 */
export async function materializeSkillDirectory(args: {
  bundle: ArtifactBundle;
  outputDir: string;
}): Promise<{ filesWritten: number; bytesWritten: number }> {
  const { bundle, outputDir } = args;

  let filesWritten = 0;
  let bytesWritten = 0;

  // Create output directory
  await mkdir(outputDir, { recursive: true });

  // Process each file in the bundle
  for (const file of bundle.files) {
    // Validate the file path
    const validatedPath = validateBundleFilePath(file.path);
    const fullPath = join(outputDir, validatedPath);

    // Ensure parent directories exist
    const parentDir = dirname(fullPath);
    await mkdir(parentDir, { recursive: true });

    // Decode and write content
    const content = decodeFileContent(file.content);
    await writeFile(fullPath, content);

    filesWritten++;
    bytesWritten += content.length;
  }

  return { filesWritten, bytesWritten };
}

/**
 * Formats an artifact export response for JSON output.
 */
export function formatExportJson(response: ArtifactExportResponse): string {
  return JSON.stringify(response, null, 2);
}

/**
 * Formats an artifact export response for human-readable output.
 */
export function formatExportHuman(response: ArtifactExportResponse): string {
  if (response.format === 'distilled-json' && response.distilled) {
    return [
      `Exported artifact: ${response.distilled.title}`,
      `Artifact ID: ${response.distilled.artifactId}`,
      `Format: ${response.format}`,
      `Exported at: ${response.exportedAt}`,
    ].join('\n');
  }

  if (response.bundle) {
    return [
      `Exported artifact: ${response.bundle.title}`,
      `Files: ${response.bundle.files.length}`,
      `Format: ${response.format}`,
      `Exported at: ${response.exportedAt}`,
    ].join('\n');
  }

  return `Exported at ${response.exportedAt}`;
}
