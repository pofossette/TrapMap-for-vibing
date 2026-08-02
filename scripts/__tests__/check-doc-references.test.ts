import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import {
  parseMarkdownLinks,
  parseBacktickedPaths,
  parseHeadingAnchors,
  validateReference,
  type ReferenceIssue,
} from '../check-doc-references.js';

const FIXTURES = resolve(import.meta.dirname, 'fixtures');

describe('parseMarkdownLinks', () => {
  it('extracts relative links', () => {
    const content = 'See [this file](./other.md) for details.';
    const links = parseMarkdownLinks(content, 'test.md');
    expect(links).toEqual([{ line: 1, text: 'this file', target: './other.md' }]);
  });

  it('extracts links with anchors', () => {
    const content = 'See [section](./other.md#heading) for details.';
    const links = parseMarkdownLinks(content, 'test.md');
    expect(links).toEqual([{ line: 1, text: 'section', target: './other.md#heading' }]);
  });

  it('ignores external URLs', () => {
    const content = 'See [example](https://example.com) for details.';
    const links = parseMarkdownLinks(content, 'test.md');
    expect(links).toEqual([]);
  });

  it('handles multiple links on different lines', () => {
    const content = 'Line 1 [a](./a.md)\nLine 2 [b](./b.md)';
    const links = parseMarkdownLinks(content, 'test.md');
    expect(links).toHaveLength(2);
    expect(links[0]).toEqual({ line: 1, text: 'a', target: './a.md' });
    expect(links[1]).toEqual({ line: 2, text: 'b', target: './b.md' });
  });
});

describe('parseBacktickedPaths', () => {
  it('extracts backticked repository paths', () => {
    const content = 'The file `packages/foo/src/bar.ts` is important.';
    const paths = parseBacktickedPaths(content, 'test.md');
    expect(paths).toEqual([{ line: 1, path: 'packages/foo/src/bar.ts' }]);
  });

  it('ignores non-path backticks', () => {
    const content = 'Run `pnpm test` to verify.';
    const paths = parseBacktickedPaths(content, 'test.md');
    expect(paths).toEqual([]);
  });

  it('handles multiple paths', () => {
    const content = '`packages/a/src/b.ts` and `packages/c/src/d.ts`';
    const paths = parseBacktickedPaths(content, 'test.md');
    expect(paths).toHaveLength(2);
  });
});

describe('parseHeadingAnchors', () => {
  it('extracts headings', () => {
    const content = '# Title\n## Section\n### Sub';
    const anchors = parseHeadingAnchors(content);
    expect(anchors).toEqual(['title', 'section', 'sub']);
  });

  it('handles headings with special chars', () => {
    const content = '## Hello World! @#$';
    const anchors = parseHeadingAnchors(content);
    expect(anchors).toEqual(['hello-world-']);
  });
});

describe('validateReference', () => {
  it('passes for valid file', () => {
    const issues: ReferenceIssue[] = [];
    validateReference(
      resolve(FIXTURES, 'valid-link-target.md'),
      resolve(FIXTURES, 'test.md'),
      1,
      'link',
      issues,
    );
    expect(issues).toEqual([]);
  });

  it('fails for missing file', () => {
    const issues: ReferenceIssue[] = [];
    validateReference(
      resolve(FIXTURES, 'nonexistent.md'),
      resolve(FIXTURES, 'test.md'),
      5,
      'link',
      issues,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe('link');
    expect(issues[0].line).toBe(5);
  });

  it('rejects path traversal', () => {
    const issues: ReferenceIssue[] = [];
    validateReference(
      resolve(FIXTURES, '../../../etc/passwd'),
      resolve(FIXTURES, 'test.md'),
      1,
      'path',
      issues,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe('path');
  });
});
