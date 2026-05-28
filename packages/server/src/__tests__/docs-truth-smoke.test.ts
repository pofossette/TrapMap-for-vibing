import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

function readDoc(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf8');
}

describe('docs truth smoke', () => {
  it('CODE_GUIDE uses current server entry name', () => {
    const guide = readDoc('docs/guides/CODE_GUIDE.md');

    expect(guide).toContain('buildServer()');
    expect(guide).not.toContain('createApp()');
  });

  it('key docs reference SYSTEM_TRUTH_SOURCES.md', () => {
    const docs = ['README.md', 'docs/README.md'];

    for (const doc of docs) {
      const content = readDoc(doc);
      expect(content, `${doc} should link to SYSTEM_TRUTH_SOURCES.md`).toContain(
        'SYSTEM_TRUTH_SOURCES.md',
      );
    }
  });

  it('SYSTEM_TRUTH_SOURCES.md exists', () => {
    const content = readDoc('docs/reference/SYSTEM_TRUTH_SOURCES.md');
    expect(content.length).toBeGreaterThan(0);
  });

  it('non-planned truth source paths exist on disk', () => {
    const content = readDoc('docs/reference/SYSTEM_TRUTH_SOURCES.md');

    // Skip paths on rows annotated with "planned" or "Task"
    const lines = content.split('\n');
    for (const line of lines) {
      if (/planned|Task \d/i.test(line)) continue;
      // Extract paths from this non-planned line
      const linePathPattern = /`([a-z0-9_.-]+\/[a-z0-9_/.-]+\.[a-z]+)`/gi;
      const lineMatches = line.matchAll(linePathPattern);
      for (const pathMatch of lineMatches) {
        const relPath = pathMatch[1];
        const absPath = resolve(ROOT, relPath);
        const serverRelativePath = resolve(ROOT, 'packages/server/src', relPath);
        expect(
          existsSync(absPath) || existsSync(serverRelativePath),
          `truth source path should exist: ${relPath}`,
        ).toBe(true);
      }
    }
  });

  it('DOCS_TRUTH_MATRIX.md exists', () => {
    const content = readDoc('docs/reference/DOCS_TRUTH_MATRIX.md');
    expect(content.length).toBeGreaterThan(0);
  });

  it('SYSTEM_TRUTH_SOURCES.md references DOCS_TRUTH_MATRIX.md', () => {
    const content = readDoc('docs/reference/SYSTEM_TRUTH_SOURCES.md');
    expect(content).toContain('DOCS_TRUTH_MATRIX.md');
  });

  it('guardrail docs mention pnpm check:docs-drift and pnpm check:complexity', () => {
    const guardrailDocs = [
      'docs/operations/TESTING.md',
      'docs/operations/CI_CD.md',
    ];

    for (const doc of guardrailDocs) {
      const content = readDoc(doc);
      expect(content, `${doc} should mention pnpm check:docs-drift`).toContain('pnpm check:docs-drift');
      expect(content, `${doc} should mention pnpm check:complexity`).toContain('pnpm check:complexity');
    }
  });

  it('DATABASE_SCHEMA.md references schema module path', () => {
    const content = readDoc('docs/reference/DATABASE_SCHEMA.md');
    expect(content).toContain('packages/server/src/lib/persistence/schema');
  });

  it('docs/README.md does not advertise JSON as primary runtime', () => {
    const content = readDoc('docs/README.md');
    expect(content).not.toContain('使用 JSON 文件存储');
  });

  it('DEPLOYMENT.md contains PostgreSQL-first posture', () => {
    const content = readDoc('docs/architecture/DEPLOYMENT.md');
    expect(content).toContain('TRAPMAP_DATABASE_URL');
    expect(content).toMatch(/PostgreSQL|pgvector/);
  });

  it('DATABASE_SCHEMA.md contains correct table count', () => {
    const content = readDoc('docs/reference/DATABASE_SCHEMA.md');
    expect(content).toContain('56');
  });

  it('docs/README.md does not contain stale schema counts', () => {
    const content = readDoc('docs/README.md');
    expect(content).not.toContain('48 张表');
    expect(content).not.toContain('54 张表');
  });
});
