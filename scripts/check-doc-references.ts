/**
 * Source-Aware Documentation Reference Guard
 *
 * Validates active Markdown documents for:
 * 1. Local link targets exist
 * 2. Heading anchors are valid
 * 3. Backticked repository paths point to existing files
 *
 * Active surfaces: README.md, AGENTS.md, plan.md, docs/{architecture,guides,operations,reference,todos}/**
 * Excluded: docs/archived/**, docs/plans/**, docs/superpowers/**
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative, dirname, join } from 'node:path';

// ── Types ────────────────────────────────────────────────────────────

export interface ReferenceIssue {
  file: string;
  line: number;
  kind: 'link' | 'anchor' | 'path';
  message: string;
  target: string;
}

interface ParsedLink {
  line: number;
  text: string;
  target: string;
}

interface ParsedPath {
  line: number;
  path: string;
}

// ── Parsing (exported for testing) ───────────────────────────────────

/**
 * Extract local Markdown links from content.
 * Skips external URLs (http/https/mailto) and historical references.
 */
export function parseMarkdownLinks(content: string, filePath: string): ParsedLink[] {
  const links: ParsedLink[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Match [text](target) but not ![alt](image)
    const regex = /(?<!!)\[([^\]]*)\]\(([^)]+)\)/g;
    let match;

    while ((match = regex.exec(line)) !== null) {
      const target = match[2];
      // Skip external URLs
      if (/^(https?:\/\/|mailto:)/.test(target)) continue;
      // Skip historical references to deleted packages
      if (target.includes('（Wave-10 已删除）')) continue;
      links.push({ line: i + 1, text: match[1], target });
    }
  }

  return links;
}

/**
 * Extract backticked paths that look like repository paths.
 * Matches patterns like `packages/foo/src/bar.ts` or `scripts/check.ts`.
 * Skips paths with wildcards, historical references, and non-existent paths.
 */
export function parseBacktickedPaths(content: string, filePath: string): ParsedPath[] {
  const paths: ParsedPath[] = [];
  const lines = content.split('\n');

  // Patterns that look like repo paths (contain / and end with file extension)
  const pathPattern = /^(packages|scripts|docs|evals|src)\/.+\.\w+$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const regex = /`([^`]+)`/g;
    let match;

    while ((match = regex.exec(line)) !== null) {
      const candidate = match[1];
      // Skip paths with wildcards (they're patterns, not actual paths)
      if (candidate.includes('*')) continue;
      // Skip historical references to deleted packages
      if (candidate.includes('（Wave-10 已删除）')) continue;
      if (pathPattern.test(candidate)) {
        paths.push({ line: i + 1, path: candidate });
      }
    }
  }

  return paths;
}

/**
 * Extract heading anchors from Markdown content.
 * Converts headings to GitHub-style anchor IDs.
 */
export function parseHeadingAnchors(content: string): string[] {
  const anchors: string[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const match = line.match(/^#{1,6}\s+(.+)$/);
    if (match) {
      // Convert to GitHub-style anchor: lowercase, replace spaces with -, remove special chars
      const anchor = match[1]
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w-]/g, '');
      anchors.push(anchor);
    }
  }

  return anchors;
}

// ── Validation (exported for testing) ────────────────────────────────

const REPO_ROOT = resolve(import.meta.dirname, '..');

/**
 * Validate that a reference target exists and is within the repository.
 * Appends issues to the provided array.
 */
export function validateReference(
  targetPath: string,
  sourceFile: string,
  line: number,
  kind: 'link' | 'anchor' | 'path',
  issues: ReferenceIssue[],
): void {
  // Check for path traversal
  const resolved = resolve(targetPath);
  if (!resolved.startsWith(REPO_ROOT)) {
    issues.push({
      file: sourceFile,
      line,
      kind,
      message: `Path traversal detected: target escapes repository root`,
      target: targetPath,
    });
    return;
  }

  // Check existence
  if (!existsSync(resolved)) {
    issues.push({
      file: sourceFile,
      line,
      kind,
      message: `Target does not exist: ${targetPath}`,
      target: targetPath,
    });
  }
}

// ── Active surface discovery ─────────────────────────────────────────

const ACTIVE_ROOT_FILES = ['README.md', 'AGENTS.md', 'plan.md'];
const ACTIVE_DOCS_SUBDIRS = ['architecture', 'guides', 'operations', 'reference', 'todos'];
const EXCLUDED_DOCS_SUBDIRS = ['archived', 'plans', 'superpowers'];

/**
 * Parse plan.md for links that reactivate files in excluded directories.
 * An excluded file is reactivated only when the root plan.md contains a
 * local link whose resolved target points into an excluded directory.
 */
function parsePlanReactivations(root: string): string[] {
  const planPath = resolve(root, 'plan.md');
  if (!existsSync(planPath)) return [];

  const content = readFileSync(planPath, 'utf-8');
  const links = parseMarkdownLinks(content, 'plan.md');
  const reactivated: string[] = [];

  for (const link of links) {
    const target = link.target.split('#')[0]; // strip anchor
    if (!target) continue;
    const resolved = resolve(root, target);
    const rel = relative(root, resolved);

    const isExcluded = EXCLUDED_DOCS_SUBDIRS.some(
      (subdir) => rel.startsWith(`docs/${subdir}/`) || rel === `docs/${subdir}`,
    );

    if (isExcluded && existsSync(resolved)) {
      try {
        if (statSync(resolved).isFile()) {
          reactivated.push(resolved);
        }
      } catch {
        // unreadable, skip
      }
    }
  }

  return reactivated;
}

/**
 * Discover all active Markdown files in the repository.
 * Exported for testing.
 */
export function discoverActiveFiles(root: string): string[] {
  const files: string[] = [];

  // Root active files
  for (const name of ACTIVE_ROOT_FILES) {
    const path = resolve(root, name);
    if (existsSync(path)) {
      files.push(path);
    }
  }

  // Active docs subdirectories
  const docsDir = resolve(root, 'docs');
  for (const subdir of ACTIVE_DOCS_SUBDIRS) {
    const dirPath = resolve(docsDir, subdir);
    if (existsSync(dirPath)) {
      collectMarkdownFiles(dirPath, files);
    }
  }

  // Reactivated files from plan.md links into excluded directories
  for (const file of parsePlanReactivations(root)) {
    if (!files.includes(file)) {
      files.push(file);
    }
  }

  return files;
}

/**
 * Recursively collect all .md files in a directory.
 */
function collectMarkdownFiles(dir: string, files: string[]): void {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectMarkdownFiles(fullPath, files);
    } else if (entry.name.endsWith('.md')) {
      files.push(fullPath);
    }
  }
}

// ── Main checking logic ──────────────────────────────────────────────

/**
 * Check a single active Markdown file for reference issues.
 * Exported for testing.
 */
export function checkFile(filePath: string, repoRoot: string = REPO_ROOT): ReferenceIssue[] {
  const issues: ReferenceIssue[] = [];
  const content = readFileSync(filePath, 'utf-8');
  const relativePath = relative(repoRoot, filePath);
  const fileDir = dirname(filePath);

  // 1. Validate Markdown links
  const links = parseMarkdownLinks(content, relativePath);
  for (const link of links) {
    const [targetFile, anchor] = link.target.split('#');
    const resolvedTarget = resolve(fileDir, targetFile);

    validateReference(resolvedTarget, relativePath, link.line, 'link', issues);

    // If link target exists and has an anchor, validate the anchor
    if (anchor && existsSync(resolvedTarget)) {
      try {
        const targetContent = readFileSync(resolvedTarget, 'utf-8');
        const anchors = parseHeadingAnchors(targetContent);
        if (!anchors.includes(anchor)) {
          issues.push({
            file: relativePath,
            line: link.line,
            kind: 'anchor',
            message: `Anchor #${anchor} not found in ${targetFile}`,
            target: link.target,
          });
        }
      } catch {
        // Target is not a readable file (e.g., directory), skip anchor validation
      }
    }
  }

  // 2. Validate backticked paths
  const paths = parseBacktickedPaths(content, relativePath);
  for (const p of paths) {
    const resolvedPath = resolve(repoRoot, p.path);
    validateReference(resolvedPath, relativePath, p.line, 'path', issues);
  }

  return issues;
}

/**
 * Run the reference guard on all active surfaces.
 */
export function checkDocReferences(root: string): ReferenceIssue[] {
  const files = discoverActiveFiles(root);
  const allIssues: ReferenceIssue[] = [];

  for (const file of files) {
    allIssues.push(...checkFile(file));
  }

  return allIssues;
}

// ── CLI entry point ──────────────────────────────────────────────────

function main(): void {
  const issues = checkDocReferences(REPO_ROOT);

  if (issues.length > 0) {
    for (const issue of issues) {
      console.error(
        `[doc-references] FAIL: ${issue.file}:${issue.line} [${issue.kind}] ${issue.message}`,
      );
    }
    console.error(
      `\n[doc-references] ${issues.length} issue(s) found. Fix the references and try again.`,
    );
    process.exit(1);
  }

  console.log('[doc-references] All active document references validated successfully.');
}

// Only run when executed directly, not when imported (e.g. by tests).
const isDirectRun = !process.env.VITEST && process.argv[1]?.includes('check-doc-references');
if (isDirectRun) {
  main();
}
