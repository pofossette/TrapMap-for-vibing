// One-time migration: move colocated src tests to sibling test directory.
// Usage: pnpm exec tsx scripts/migrate-tests-to-test-dir.ts [--dry-run]
// For each package/app under packages/* and apps/*, find src tests, compute target test,
// create directories, git mv the file, and rewrite relative imports.
// The core rewriteImportPath is unit-tested; see Task 1 Step 2.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

/**
 * Rewrite a single import string from oldFile context to newFile context.
 * - Non-relative (does not start with '.') → unchanged.
 * - Relative → resolve against oldFile's directory, then relativize from newFile's directory.
 * Handles .js / .ts / .tsx extensions preserved as-is.
 */
export function rewriteImportPath(original: string, oldFile: string, newFile: string): string {
  if (!original.startsWith('.')) return original;
  const oldDir = path.posix.dirname(toPosix(oldFile));
  const newDir = path.posix.dirname(toPosix(newFile));
  const absoluteTarget = path.posix.normalize(path.posix.join(oldDir, original));
  let relative = path.posix.relative(newDir, absoluteTarget);
  if (!relative.startsWith('.')) relative = './' + relative;
  return relative;
}

function toPosix(p: string): string {
  return p.split(path.sep).join(path.posix.sep);
}

function toNative(p: string): string {
  return p.split(path.posix.sep).join(path.sep);
}

function collectTestFiles(root: string): string[] {
  const results: string[] = [];
  const entries = search(root);
  for (const file of entries) {
    if (file.match(/\.test\.tsx?$/)) results.push(file);
  }
  return results;
}

function search(dir: string): string[] {
  const out: string[] = [];
  let ents: import('node:fs').Dirent[];
  try {
    ents = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of ents) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === 'dist' || e.name === '.git') continue;
      out.push(...search(full));
    } else if (e.isFile()) {
      out.push(full);
    }
  }
  return out;
}

function rewriteFileImports(content: string, oldFile: string, newFile: string): string {
  return content
    .replace(/(from\s+)(['"])(\.[^'"]+)(['"])/g, (_m, prefix, q1, spec, q2) => {
      const rewritten = rewriteImportPath(spec, oldFile, newFile);
      return `${prefix}${q1}${rewritten}${q2}`;
    })
    .replace(/(import\s*\(\s*)(['"])(\.[^'"]+)(['"])/g, (_m, prefix, q1, spec, q2) => {
      const rewritten = rewriteImportPath(spec, oldFile, newFile);
      return `${prefix}${q1}${rewritten}${q2}`;
    });
}

function main(): void {
  const dryRun = process.argv.includes('--dry-run');
  const roots = [...collectRoots('packages'), ...collectRoots('apps')];
  const moves: Array<{ from: string; to: string }> = [];
  for (const root of roots) {
    const srcDir = path.join(root, 'src');
    if (!existsSync(srcDir)) continue;
    const files = collectTestFiles(srcDir);
    for (const from of files) {
      const fromPosix = toPosix(from);
      const relativeFromSrc = path.posix.relative(toPosix(path.join(root, 'src')), fromPosix);
      const toPosixPath = path.posix.join(toPosix(root), 'test', relativeFromSrc);
      const to = toNative(toPosixPath);
      moves.push({ from, to });
    }
  }
  console.log(`[migrate-tests] Found ${moves.length} test files to migrate`);
  for (const { from, to } of moves) {
    console.log(`  ${toPosix(from)} -> ${toPosix(to)}`);
  }
  if (dryRun) {
    console.log('[migrate-tests] dry-run, no changes made');
    return;
  }
  for (const { from, to } of moves) {
    const toDir = path.dirname(to);
    mkdirSync(toDir, { recursive: true });
    const content = readFileSync(from, 'utf8');
    const fromPosix = toPosix(from);
    const toPosixPath = toPosix(to);
    const rewritten = rewriteFileImports(content, fromPosix, toPosixPath);
    let isTracked = false;
    try {
      execSync(`git ls-files --error-unmatch "${from}"`, { stdio: 'ignore' });
      isTracked = true;
    } catch {
      isTracked = false;
    }
    if (isTracked) {
      writeFileSync(from, rewritten, 'utf8');
      try {
        execSync(`git mv "${from}" "${to}"`, { stdio: 'inherit' });
      } catch (e) {
        console.error(`git mv failed for ${from}:`, e);
        writeFileSync(to, rewritten, 'utf8');
        execSync(`rm "${from}"`);
      }
    } else {
      writeFileSync(to, rewritten, 'utf8');
      execSync(`rm "${from}"`);
    }
  }
  console.log(`[migrate-tests] Migrated ${moves.length} files`);
}

function collectRoots(base: string): string[] {
  if (!existsSync(base)) return [];
  return readdirSync(base, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(base, d.name));
}

if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('migrate-tests-to-test-dir.ts')
) {
  main();
}
