import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');

// ── Phase 6: Directory structure guard ──

const ROOT_MD_ALLOWLIST = [
  'AGENTS.md',
  'CLAUDE.md',
  'CHANGELOG.md',
  'README.md',
  'architecture.md',
  'plan.md',
];

const DOCS_SUBDIR_WHITELIST = [
  'architecture',
  'guides',
  'operations',
  'reference',
  'plans',
  'superpowers',
  'archived',
  'todos',
];

const DISALLOWED_ROOT_DIRS = ['archived'];

let failures = 0;

function fail(msg) {
  console.error(`[structure-guard] FAIL: ${msg}`);
  failures++;
}

// Check 1: Root markdown allowlist
function checkRootMarkdown() {
  const files = readdirSync(ROOT).filter((f) => f.endsWith('.md') && !f.startsWith('.'));
  for (const f of files) {
    if (!ROOT_MD_ALLOWLIST.includes(f)) {
      fail(`Unexpected root markdown file: ${f}`);
    }
  }
}

// Check 2: docs/ subdirectory whitelist
function checkDocsSubdirs() {
  const docsDir = join(ROOT, 'docs');
  if (!existsSync(docsDir)) {
    fail('docs/ directory does not exist');
    return;
  }
  const subdirs = readdirSync(docsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  for (const d of subdirs) {
    if (!DOCS_SUBDIR_WHITELIST.includes(d)) {
      fail(`Unexpected docs/ subdirectory: ${d}`);
    }
  }
}

// Check 3: No duplicate directories at root
function checkNoDuplicateRootDirs() {
  for (const d of DISALLOWED_ROOT_DIRS) {
    if (existsSync(join(ROOT, d))) {
      fail(`Duplicate root directory must not exist: ${d}/`);
    }
  }
}

// Check 4: packages/* and apps/* have README.md
function checkPackageReadmes() {
  for (const [root, kind] of [
    [join(ROOT, 'packages'), 'packages'],
    [join(ROOT, 'apps'), 'apps'],
  ]) {
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
