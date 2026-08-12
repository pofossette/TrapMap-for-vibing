/**
 * Consolidated documentation guard (check:docs).
 *
 * Merges the former doc-facing check scripts into one command while keeping
 * distinct failure locators internally:
 *
 *   blocking tier   : doc-drift, mermaid, md-lint
 *   non-blocking    : doc-truth, doc-references, links (visible warnings only)
 *
 * The non-blocking tier preserves the historical CI `|| true` semantics for
 * doc-truth / doc-references / links — issues are surfaced but never block.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';

import { type CheckStep, runCheckSteps } from './lib/check-runner.js';

const ROOT = resolve(import.meta.dirname, '..');
const require_ = createRequire(import.meta.url);

// Resolve a package's CLI binary through the local node_modules chain
// (works in fully installed workspaces and worktrees that share an ancestor
// node_modules). Falls back to `pnpm exec <pkg>` when unresolved.
function resolveBinStep(name: string, pkgName: string, ...rest: string[]): CheckStep {
  try {
    const entry = require_.resolve(pkgName);
    const pkgDir = dirname(entry);
    const pkgJson = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')) as {
      bin?: string | Record<string, string>;
    };
    const binSpec = typeof pkgJson.bin === 'string' ? pkgJson.bin : pkgJson.bin?.[pkgName];
    if (binSpec) {
      return { name, command: 'node', args: [join(pkgDir, binSpec), ...rest] };
    }
  } catch {
    // fall through to pnpm exec
  }
  return { name, command: 'pnpm', args: ['exec', pkgName, ...rest] };
}

// Mirrors the historical check:links `find` exclusions: top-level
// docs/archived/* and docs/plans/* plus docs/superpowers/specs/* only
// (the rest of docs/superpowers/** was always included in link checking).
const LINK_CHECK_EXCLUDED_REL = [
  join('docs', 'archived'),
  join('docs', 'plans'),
  join('docs', 'superpowers', 'specs'),
];

function isExcluded(absDir: string): boolean {
  const rel = resolve(absDir);
  return LINK_CHECK_EXCLUDED_REL.some((excluded) => rel === resolve(ROOT, excluded));
}

function collectMarkdownFiles(subdirs: string[]): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    let entries: import('node:fs').Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (isExcluded(join(dir, entry.name))) continue;
        walk(join(dir, entry.name));
      } else if (entry.name.endsWith('.md')) {
        files.push(join(dir, entry.name));
      }
    }
  };
  for (const subdir of subdirs) {
    walk(join(ROOT, subdir));
  }
  return files.sort();
}

const steps: CheckStep[] = [
  {
    name: 'doc-drift',
    command: 'pnpm',
    args: ['exec', 'tsx', 'scripts/check-doc-drift.ts'],
  },
  {
    name: 'mermaid',
    command: 'pnpm',
    args: ['exec', 'tsx', 'scripts/check-mermaid.ts'],
  },
  {
    name: 'md-lint',
    ...resolveBinStep('md-lint', 'markdownlint-cli2', 'docs/**/*.md', 'README.md', 'evals/**/*.md'),
  },
  {
    name: 'doc-truth',
    command: 'pnpm',
    args: ['exec', 'tsx', 'scripts/check-doc-truth.ts'],
    blocking: false,
  },
  {
    name: 'doc-references',
    command: 'pnpm',
    args: ['exec', 'tsx', 'scripts/check-doc-references.ts'],
    blocking: false,
  },
  {
    name: 'links',
    ...resolveBinStep('links', 'markdown-link-check', ...collectMarkdownFiles(['docs', 'evals'])),
    blocking: false,
  },
];

const result = await runCheckSteps(steps);
process.exitCode = result.ok ? 0 : 1;
