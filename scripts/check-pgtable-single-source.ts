/**
 * pgTable Single-Source Guard (check:pgtable-single-source).
 *
 * Prevents the dual table-definition source problem from coming back:
 * `packages/db/src/schema/` is the only place that may define
 * `pgTable(...)` tables, and service schema.ts files must re-export them
 * instead of redefining them.
 *
 * Two checks:
 *
 *   1. Every service schema.ts file (under the packages/service-* src trees)
 *      must contain an `export * from '@trapmap/db'`
 *      re-export and must NOT call `pgTable(`.
 *   2. Sweep: no `pgTable(` call may appear anywhere in a service package's
 *      src tree (a definition sneaked into another file would reintroduce the
 *      dual source just as badly).
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { finishCheckRun } from './lib/check-result.js';
import { collectSourceFiles } from './lib/eval-import-lib.js';

// ── Types ────────────────────────────────────────────────────────────

export interface CheckResult {
  failures: number;
  messages: string[];
}

const PERSISTENCE_SCHEMA_RE = /export\s+\*\s+from\s+['"]@trapmap\/db['"]/;
const PGTABLE_CALL_RE = /pgTable\s*\(/;

// ── Checking logic (testable) ────────────────────────────────────────

/** Check a single schema.ts file's content. Returns failure messages. */
export function checkSchemaFile(relPath: string, content: string): string[] {
  const messages: string[] = [];
  if (PGTABLE_CALL_RE.test(content)) {
    messages.push(
      `[pgtable-single-source] ${relPath} defines pgTable(...) directly — tables must live only in @trapmap/db`,
    );
  }
  if (!PERSISTENCE_SCHEMA_RE.test(content)) {
    messages.push(
      `[pgtable-single-source] ${relPath} does not re-export '@trapmap/db' — schema.ts files must be pure re-exports`,
    );
  }
  return messages;
}

function isCommentLine(trimmed: string): boolean {
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
}

/** Sweep one source file for pgTable( calls. Returns failure messages. */
export function checkNoPgTableCall(relPath: string, content: string): string[] {
  const messages: string[] = [];
  const lines = content.split('\n');
  for (const [i, line] of lines.entries()) {
    if (isCommentLine(line.trimStart())) continue;
    if (PGTABLE_CALL_RE.test(line)) {
      messages.push(
        `[pgtable-single-source] ${relPath}:${i + 1} calls pgTable(...) — table definitions belong in @trapmap/db only`,
      );
      break;
    }
  }
  return messages;
}

function isServiceSrcDir(
  entry: { isDirectory(): boolean; name: string },
  packagesDir: string,
): boolean {
  if (!entry.isDirectory() || !entry.name.startsWith('service-')) return false;
  const srcDir = join(packagesDir, entry.name, 'src');
  return statSync(srcDir, { throwIfNoEntry: false })?.isDirectory() ?? false;
}

function scanServiceSrc(root: string, srcDir: string, messages: string[]): void {
  for (const rel of collectSourceFiles(srcDir, root)) {
    const content = readFileSync(resolve(root, rel), 'utf8');
    if (rel.endsWith('schema.ts')) {
      messages.push(...checkSchemaFile(rel, content));
    } else {
      messages.push(...checkNoPgTableCall(rel, content));
    }
  }
}

/** Scan all service packages' src trees. Returns failure messages. */
export function scanServicePackages(root: string): string[] {
  const messages: string[] = [];
  const packagesDir = join(root, 'packages');
  if (!existsSync(packagesDir)) return messages;

  for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!isServiceSrcDir(entry, packagesDir)) continue;
    scanServiceSrc(root, join(packagesDir, entry.name, 'src'), messages);
  }
  return messages;
}

export function checkPgTableSingleSource(root: string): CheckResult {
  const messages = scanServicePackages(root);
  return { failures: messages.length, messages };
}

// ── CLI entry point ──────────────────────────────────────────────────

const ROOT = resolve(import.meta.dirname, '..');

function main(): void {
  finishCheckRun({
    name: '[pgtable-single-source]',
    result: checkPgTableSingleSource(ROOT),
    remedy: 'Move table definitions into @trapmap/db and re-export from the service schema.ts.',
    passedMessage:
      '[pgtable-single-source] all service schema.ts files are pure re-exports of @trapmap/db.',
  });
}

const isDirectRun = !process.env.VITEST && process.argv[1]?.includes('check-pgtable-single-source');
if (isDirectRun) {
  main();
}
