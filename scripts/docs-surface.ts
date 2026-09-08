/**
 * Single source of truth for documentation surface classification.
 *
 * All doc guards reference this module instead of hard-coding directory
 * tables. When the doc tree changes, update the tables here and every
 * guard follows in the same commit.
 *
 * Upstream: temp/details/01-guards.md item 1 (目录分类单源化).
 */

import { join, relative, resolve, sep } from 'node:path';

/** Root files that count as active documentation surface. */
export const ACTIVE_ROOT_FILES = ['README.md', 'AGENTS.md', 'plan.md', 'architecture.md'] as const;

/** docs/ subdirectories that count as active surface. */
export const ACTIVE_DOCS_SUBDIRS = [
  'architecture',
  'guides',
  'operations',
  'reference',
  'todos',
] as const;

/** docs/ subdirectories excluded from reference / mermaid / link scans. */
export const EXCLUDED_DOCS_SUBDIRS = ['archived', 'plans', 'superpowers'] as const;

/** Markdown files allowed at the repository root. */
export const ROOT_MD_ALLOWLIST = [
  'AGENTS.md',
  'CLAUDE.md',
  'CHANGELOG.md',
  'README.md',
  'DESIGN.md',
  'architecture.md',
  'plan.md',
] as const;

/** Subdirectories allowed directly under docs/. */
export const DOCS_SUBDIR_WHITELIST = [
  'architecture',
  'guides',
  'operations',
  'reference',
  'plans',
  'superpowers',
  'archived',
  'todos',
] as const;

/**
 * Root-level user worktree explicitly allowed to exist.
 * The structure guard never scans inside these directories.
 */
export const STRUCTURE_TEMP_ALLOWLIST = ['temp'] as const;

/**
 * History markers that exempt a reference from existence checks.
 * First marker: deleted packages. Second marker: frozen archived paths.
 */
export const HISTORY_MARKERS = ['（Wave-10 已删除）', '（已归档，路径冻结）'] as const;

/**
 * Backticked paths are only validated when they look like versioned
 * repository paths with a file suffix. Anything else (bare package
 * names, service paths without suffix) is never checked.
 */
export const BACKTICK_PATH_PATTERN = /^(packages|scripts|docs|evals|src)\/.+\.\w+$/;

/** Directories excluded from link checking, relative to the repo root. */
export const LINK_CHECK_EXCLUDED_REL: readonly string[] = [
  join('docs', 'archived'),
  join('docs', 'plans'),
  join('docs', 'superpowers'),
];

/**
 * New-skeleton files under strict lint (md-lint:current).
 * Grows as content layers land. Everything else stays on the legacy pass.
 */
export const CURRENT_LINT_GLOBS: readonly string[] = ['docs/superpowers/README.md'];

/** True when the text carries any history marker. */
export function containsHistoryMarker(text: string): boolean {
  return HISTORY_MARKERS.some((marker) => text.includes(marker));
}

/**
 * True when an absolute path falls under one of the excluded docs
 * subdirectories (docs/archived, docs/plans, docs/superpowers).
 */
export function isExcludedDocsPath(repoRoot: string, absPath: string): boolean {
  const rel = relative(resolve(repoRoot), resolve(absPath));
  return EXCLUDED_DOCS_SUBDIRS.some(
    (subdir) => rel === join('docs', subdir) || rel.startsWith(`docs${sep}${subdir}${sep}`),
  );
}
