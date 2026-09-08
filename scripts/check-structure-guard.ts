/**
 * Directory structure guard (structure-guard step of check:structure).
 *
 * All directory tables live in ./docs-surface.js (single source).
 * temp/ is an explicitly allowed user worktree: the guard never
 * scans inside it.
 */

import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  DOCS_SUBDIR_WHITELIST,
  ROOT_MD_ALLOWLIST,
  STRUCTURE_TEMP_ALLOWLIST,
} from './docs-surface.js';

const ROOT = resolve(import.meta.dirname, '..');

const DISALLOWED_ROOT_DIRS = ['archived'];

let failures = 0;

function fail(msg: string): void {
  console.error(`[structure-guard] FAIL: ${msg}`);
  failures++;
}

// Check 1: Root markdown allowlist
function checkRootMarkdown(): void {
  const files = readdirSync(ROOT).filter((f) => f.endsWith('.md') && !f.startsWith('.'));
  for (const f of files) {
    if (!(ROOT_MD_ALLOWLIST as readonly string[]).includes(f)) {
      fail(`Unexpected root markdown file: ${f}`);
    }
  }
}

// Check 2: docs/ subdirectory whitelist
function checkDocsSubdirs(): void {
  const docsDir = join(ROOT, 'docs');
  if (!existsSync(docsDir)) {
    fail('docs/ directory does not exist');
    return;
  }
  const subdirs = readdirSync(docsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  for (const d of subdirs) {
    if (!(DOCS_SUBDIR_WHITELIST as readonly string[]).includes(d)) {
      fail(`Unexpected docs/ subdirectory: ${d}`);
    }
  }
}

// Check 3: No duplicate directories at root
function checkNoDuplicateRootDirs(): void {
  for (const d of DISALLOWED_ROOT_DIRS) {
    if (existsSync(join(ROOT, d))) {
      fail(`Duplicate root directory must not exist: ${d}/`);
    }
  }
}

// Check 4: packages/* and apps/* have README.md
function checkPackageReadmes(): void {
  for (const [root, kind] of [
    [join(ROOT, 'packages'), 'packages'],
    [join(ROOT, 'apps'), 'apps'],
  ] as const) {
    if (!existsSync(root)) continue;
    const pkgs = readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    for (const pkg of pkgs) {
      const readme = join(root, pkg, 'README.md');
      if (!existsSync(readme)) {
        fail(`${kind}/${pkg}/README.md is missing`);
      }
    }
  }
}

// ── Run all checks ──

console.log('[structure-guard] Running directory structure checks...');
console.log(
  `[structure-guard] Allowed user worktree (never scanned): ${STRUCTURE_TEMP_ALLOWLIST.join(', ')}/`,
);
checkRootMarkdown();
checkDocsSubdirs();
checkNoDuplicateRootDirs();
checkPackageReadmes();

if (failures > 0) {
  console.error(`[structure-guard] ${failures} check(s) failed.`);
  process.exit(1);
} else {
  console.log('[structure-guard] All checks passed.');
}
