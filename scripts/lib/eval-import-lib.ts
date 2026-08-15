/**
 * Shared helpers for the eval import boundary guards.
 *
 * Used by scripts/check-eval-imports.ts (eval → packages import boundary) and
 * scripts/check-eval-only.ts (@eval-only marker enforcement). Keeps the two
 * guards' import collection / target resolution in one place so their notion
 * of "what evals imports" cannot drift apart.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

export const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts']);
export const EXCLUDED_DIRS = new Set(['node_modules', 'dist', 'coverage', '.git']);

const RUNTIME_TO_SOURCE_EXT: Record<string, (rel: string) => string> = {
  '.js': (rel) => `${rel.slice(0, -3)}.ts`,
  '.mjs': (rel) => `${rel.slice(0, -4)}.mts`,
  '.cjs': (rel) => `${rel.slice(0, -4)}.cts`,
};

/** Map a runtime import specifier extension back to the source file. */
export function sourcePathFor(moduleRel: string): string {
  const ext = moduleRel.slice(moduleRel.lastIndexOf('.'));
  const mapped = RUNTIME_TO_SOURCE_EXT[ext];
  if (mapped) return mapped(moduleRel);
  if (SOURCE_EXTENSIONS.has(ext)) return moduleRel;
  if (moduleRel.endsWith('/index')) return `${moduleRel}/index.ts`;
  return `${moduleRel}.ts`;
}

export interface ImportRef {
  file: string;
  line: number;
  importPath: string;
}

const SKIPPED_LINE_RE = /^(?:\/\/|\/\*|\*)|vi\.(?:mock|importActual)\(|typeof import\(/;

function isSkippedLine(trimmed: string): boolean {
  return SKIPPED_LINE_RE.test(trimmed);
}

const SPECIFIER_RE =
  /(?:import|export)\s+(?:[^;]*?\s+from\s+)?['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

/**
 * Extract import/export specifiers from a source file, skipping comments,
 * vi.mock()/vi.importActual() calls, and `typeof import()` type positions —
 * mirroring scripts/check-relative-imports.mjs scanning conventions.
 */
// fallow-ignore-next-line complexity -- scanner loop mirrors scripts/check-relative-imports.mjs line-scanning conventions by design
export function scanImportRefs(relPath: string, content: string): ImportRef[] {
  const refs: ImportRef[] = [];
  const lines = content.split('\n');
  let inBlockComment = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (inBlockComment) {
      if (line.includes('*/')) inBlockComment = false;
      continue;
    }
    const trimmed = line.trimStart();
    if (trimmed.startsWith('/*')) {
      inBlockComment = !line.includes('*/');
      continue;
    }
    if (isSkippedLine(trimmed)) continue;

    SPECIFIER_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = SPECIFIER_RE.exec(line)) !== null) {
      const importPath = match[1] ?? match[2];
      if (importPath) {
        refs.push({ file: relPath, line: i + 1, importPath });
      }
    }
  }
  return refs;
}

/**
 * Resolve a relative import specifier from an evals file to a repo-relative
 * module path under packages/, or null when the import does not reach into
 * packages/ (package-name imports like @trapmap/* route through exports and
 * are handled separately, as are intra-evals relative imports).
 */
export function resolvePackageTarget(
  repoRoot: string,
  fromFileRel: string,
  importPath: string,
): string | null {
  if (!importPath.startsWith('.')) return null;
  const abs = resolve(repoRoot, dirname(fromFileRel), importPath);
  const rel = relative(repoRoot, abs).replaceAll('\\', '/');
  if (!rel.startsWith('packages/')) return null;
  return sourcePathFor(rel);
}

/** Recursively collect source files under a directory. */
// fallow-ignore-next-line complexity -- recursive directory walker with error tolerance used by all eval-boundary guards
export function walkSourceFiles(dir: string, out: string[]): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      walkSourceFiles(resolve(dir, entry.name), out);
    } else if (SOURCE_EXTENSIONS.has(entry.name.slice(entry.name.lastIndexOf('.')))) {
      out.push(resolve(dir, entry.name));
    }
  }
}

/** Collect every import ref in a source tree, with repo-relative paths. */
export function collectImportRefs(rootAbs: string, repoRoot: string): ImportRef[] {
  const files: string[] = [];
  walkSourceFiles(rootAbs, files);
  const refs: ImportRef[] = [];
  for (const abs of files) {
    const rel = relative(repoRoot, abs).replaceAll('\\', '/');
    const content = readFileSync(abs, 'utf8');
    refs.push(...scanImportRefs(rel, content));
  }
  return refs;
}

/** True when the file's header comment carries the @eval-only marker. */
export function hasEvalOnlyMarker(content: string): boolean {
  return content.slice(0, 600).includes('@eval-only');
}

/**
 * Walk a tree and return repo-relative source paths.
 */
export function collectSourceFiles(rootAbs: string, repoRoot: string): string[] {
  const files: string[] = [];
  walkSourceFiles(rootAbs, files);
  return files.map((abs) => relative(repoRoot, abs).replaceAll('\\', '/')).sort();
}
