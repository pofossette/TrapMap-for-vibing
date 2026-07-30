import { readFileSync, readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SERVER_SRC = resolve(process.cwd(), 'packages/server/src');

function findAllTsFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__fixtures__') continue;
      results.push(...findAllTsFiles(fullPath));
    } else if (
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.spec.ts')
    ) {
      results.push(fullPath);
    }
  }
  return results;
}

function hasActualStoreCall(content: string, pattern: RegExp): boolean {
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trimStart();
    if (trimmed.startsWith('//')) continue;
    if (trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
    if (pattern.test(line)) return true;
  }
  return false;
}

describe('snapshot usage guard', () => {
  it('no production file calls store.snapshot() or store.transact()', () => {
    const allFiles = findAllTsFiles(SERVER_SRC);
    const violations: Array<{ file: string; calls: string[] }> = [];

    for (const filePath of allFiles) {
      const relPath = relative(SERVER_SRC, filePath);
      const content = readFileSync(filePath, 'utf8');
      const calls: string[] = [];

      if (hasActualStoreCall(content, /store\.snapshot\(\)/)) calls.push('store.snapshot()');
      if (hasActualStoreCall(content, /store\.transact\(/)) calls.push('store.transact()');

      if (calls.length > 0) {
        violations.push({ file: relPath, calls });
      }
    }

    expect(
      violations,
      violations.length > 0
        ? `Found store.snapshot()/store.transact() in production files:\n${violations.map((v) => `  ${v.file}: ${v.calls.join(', ')}`).join('\n')}\n\nThe compatibility store has been retired. Use owner ports instead.`
        : undefined,
    ).toEqual([]);
  });
});
