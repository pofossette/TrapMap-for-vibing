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
        expect(existsSync(absPath), `truth source path should exist: ${relPath}`).toBe(true);
      }
    }
  });
});
