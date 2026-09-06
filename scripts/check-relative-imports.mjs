#!/usr/bin/env node
/**
 * Import path hygiene guard (check:imports).
 *
 * Two checks over packages/:
 *
 *  1. Cross-package relative imports (../ or ./ that resolve into another
 *     workspace package) are violations: every cross-package dependency must
 *     go through the @trapmap/* package-name surface (exports map), which is
 *     what enables bundlers to resolve and tree-shake the intended entry.
 *     Intra-package relative imports are the normal, tree-shaking-friendly
 *     way to reference sibling modules and are always allowed.
 *
 *  2. Self-package imports (a file importing its own package by name, e.g.
 *     '@trapmap/client-core/session/session-provider.js' from inside
 *     client-core) are violations except in @trapmap/host-distributed, which
 *     deliberately references its own subpath exports (see its exports map).
 *     Self-imports force the module through the package boundary, which is
 *     unnecessary indirection and hurts tree-shaking in bundled consumers
 *     (e.g. web-panel bundling client-core); use a relative path instead.
 *
 * Usage:
 *   node scripts/check-relative-imports.mjs                  # check and report (non-zero exit)
 *   node scripts/check-relative-imports.mjs --fix            # print suggested fixes
 *   node scripts/check-relative-imports.mjs --only-cross-dir # only ../ cross-package relative imports
 */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();
const sourceRoots = ['packages'];
const sourceExtensions = new Set(['.ts', '.tsx', '.mts', '.cts']);
const excludeDirs = new Set(['node_modules', 'dist', 'coverage', '.git']);

const args = process.argv.slice(2);
const fixMode = args.includes('--fix');
const onlyCrossDir = args.includes('--only-cross-dir');

/**
 * Packages that deliberately reference their own subpath exports. Keep this
 * list as small as possible: self-imports are the exception, relative paths
 * are the rule.
 */
const SELF_IMPORT_EXCEPTION_PACKAGES = new Set(['@trapmap/host-distributed']);

async function collectPackages() {
  const packages = new Map(); // rel dir -> { name }
  for (const root of sourceRoots) {
    const absRoot = path.resolve(repoRoot, root);
    let entries;
    try {
      entries = await readdir(absRoot, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const pkgJsonPath = path.join(absRoot, entry.name, 'package.json');
      try {
        const pkgJson = JSON.parse(await readFile(pkgJsonPath, 'utf8'));
        if (typeof pkgJson.name === 'string') {
          packages.set(path.join(root, entry.name), pkgJson.name);
        }
      } catch {
        // no package.json or invalid JSON
      }
    }
  }
  return packages;
}

async function walk(dir, out) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (excludeDirs.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath, out);
    } else if (sourceExtensions.has(path.extname(entry.name))) {
      out.push(fullPath);
    }
  }
}

/** Extract import specifiers from one line (static, dynamic, re-export). */
function extractSpecifiers(line) {
  const specifiers = [];
  const ws = '[ \t]';
  const re = new RegExp(
    `(?:import|export)${ws}+(?:[^;]*?${ws}+from${ws}+)?['"]([^'"]+)['"]|import${ws}*([ \t]*['"]([^'"]+)['"]${ws}*)`,
    'g',
  );
  let match = re.exec(line);
  while (match !== null) {
    const specifier = match[1] || match[2];
    if (specifier) specifiers.push(specifier);
    match = re.exec(line);
  }
  return specifiers;
}

function isSkippedLine(trimmed) {
  return (
    trimmed.startsWith('//') ||
    trimmed.startsWith('/*') ||
    trimmed.startsWith('*') ||
    trimmed.includes('vi.mock(') ||
    trimmed.includes('vi.importActual(') ||
    trimmed.includes('typeof import(')
  );
}

async function main() {
  const packages = await collectPackages();
  const violations = [];

  for (const [pkgRel, pkgName] of packages) {
    const absRoot = path.resolve(repoRoot, pkgRel);
    const files = [];
    await walk(absRoot, files);
    for (const absFile of files) {
      const relFile = path.relative(repoRoot, absFile).replaceAll('\\', '/');
      const contents = await readFile(absFile, 'utf8');
      const lines = contents.split(String.fromCharCode(10));
      let inBlockComment = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? '';
        const lineNumber = i + 1;
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

        for (const specifier of extractSpecifiers(line)) {
          // 1) Self-package import check.
          if (specifier === pkgName || specifier.startsWith(`${pkgName}/`)) {
            if (!SELF_IMPORT_EXCEPTION_PACKAGES.has(pkgName)) {
              violations.push({
                kind: 'self-import',
                file: relFile,
                line: lineNumber,
                importPath: specifier,
                message: `self-import of ${pkgName} — use a relative path instead (self-imports break tree-shaking in bundled consumers)`,
              });
            }
            continue;
          }
          // 2) Cross-package relative import check.
          if (!specifier.startsWith('.')) continue;
          if (onlyCrossDir && !specifier.startsWith('../')) continue;
          const targetAbs = path.resolve(path.dirname(absFile), specifier);
          const targetRel = path.relative(repoRoot, targetAbs).replaceAll('\\', '/');
          if (!targetRel.startsWith('packages/')) continue;
          if (targetRel.startsWith(`${pkgRel}/`)) continue; // intra-package
          violations.push({
            kind: 'cross-package-relative',
            file: relFile,
            line: lineNumber,
            importPath: specifier,
            message: `cross-package relative import into ${targetRel} — use the @trapmap/* package-name surface`,
          });
        }
      }
    }
  }

  if (violations.length === 0) {
    console.log('No import path hygiene violations found. All good.');
    process.exit(0);
  }

  if (fixMode) {
    console.log(
      `Found ${violations.length} violation(s). Prefer relative paths for self-imports and @trapmap/* package names for cross-package imports.`,
    );
    for (const v of violations) {
      console.log(`  ${v.file}:${v.line}  "${v.importPath}"  (${v.message})`);
    }
    process.exit(1);
  }

  console.error(`Found ${violations.length} import path violation(s):${String.fromCharCode(10)}`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  "${v.importPath}"`);
    console.error(`      ${v.message}`);
  }
  console.error(`${String.fromCharCode(10)}Fix them, then re-run. (Use --fix for details.)`);
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
