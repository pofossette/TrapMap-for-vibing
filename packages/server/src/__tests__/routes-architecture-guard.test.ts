import { readFileSync, readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROUTES_SRC = resolve(process.cwd(), 'packages/server/src/routes');
const FORBIDDEN_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: 'store.snapshot()', pattern: /\bstore\.snapshot\(\)/ },
  { label: 'PostgresStore', pattern: /\bPostgresStore\b/ },
  { label: 'task_queue', pattern: /\btask_queue\b/ },
  { label: 'domain_event_outbox', pattern: /\bdomain_event_outbox\b/ },
];

const ALLOWLIST = new Set<string>([
  // Explicit compatibility/admin exceptions with direct store or PG runtime access.
  'admin-benchmark.ts',
  'admin-boundary-search.ts',
  'feedback.ts',
  'feedback-admin.ts',
  'maintenance.ts',
  'operations/status.ts',
  'teams.ts',
]);

function findAllRouteFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findAllRouteFiles(fullPath));
      continue;
    }
    if (
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.spec.ts')
    ) {
      results.push(fullPath);
    }
  }
  return results;
}

function uncommentedMatches(content: string, pattern: RegExp): boolean {
  return content.split('\n').some((line) => {
    const trimmed = line.trimStart();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
      return false;
    }
    return pattern.test(line);
  });
}

describe('routes architecture guard', () => {
  it('route files avoid direct infra-only write-path dependencies', () => {
    const violations: Array<{ file: string; matches: string[] }> = [];

    for (const filePath of findAllRouteFiles(ROUTES_SRC)) {
      const relPath = relative(ROUTES_SRC, filePath);
      if (ALLOWLIST.has(relPath)) continue;

      const source = readFileSync(filePath, 'utf8');
      const matches = FORBIDDEN_PATTERNS.filter(({ pattern }) =>
        uncommentedMatches(source, pattern),
      ).map(({ label }) => label);

      if (matches.length > 0) {
        violations.push({ file: relPath, matches });
      }
    }

    expect(
      violations,
      violations.length > 0
        ? `Found direct infra-only route dependencies:\n${violations.map((entry) => `  ${entry.file}: ${entry.matches.join(', ')}`).join('\n')}\n\nRefactor the route to use repos/services/publishers, or add a narrowly scoped allowlist entry with a clear compatibility reason.`
        : undefined,
    ).toEqual([]);
  });

  it('allowlisted route files still exist', () => {
    const missing = [...ALLOWLIST].filter((relPath) => {
      try {
        readFileSync(resolve(ROUTES_SRC, relPath), 'utf8');
        return false;
      } catch {
        return true;
      }
    });

    expect(missing, `Allowlist entries not found on disk: ${missing.join(', ')}`).toEqual([]);
  });
});
