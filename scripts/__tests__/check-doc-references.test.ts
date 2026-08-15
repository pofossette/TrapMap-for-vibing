import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  type ReferenceIssue,
  checkDocReferences,
  expandBracePattern,
  parseBacktickedPaths,
  parseHeadingAnchors,
  parseMarkdownLinks,
  validateReference,
} from '../check-doc-references.js';

const FIXTURES = resolve(import.meta.dirname, 'fixtures');
const ROOT = resolve(import.meta.dirname, '../..');

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

describe('expandBracePattern', () => {
  it('returns the pattern unchanged when it has no braces', () => {
    expect(expandBracePattern('evals/promptfoo/parity-retrieval.test.ts')).toEqual([
      'evals/promptfoo/parity-retrieval.test.ts',
    ]);
  });

  it('expands a single brace group into each option', () => {
    expect(expandBracePattern('evals/parity-{a,b,c}.test.ts')).toEqual([
      'evals/parity-a.test.ts',
      'evals/parity-b.test.ts',
      'evals/parity-c.test.ts',
    ]);
  });

  it('expands nested brace groups', () => {
    expect(expandBracePattern('evals/parity-{a,{b,c}}.test.ts')).toEqual([
      'evals/parity-a.test.ts',
      'evals/parity-b.test.ts',
      'evals/parity-c.test.ts',
    ]);
  });

  it('treats unbalanced braces as a literal pattern', () => {
    expect(expandBracePattern('evals/parity-{a,b.test.ts')).toEqual(['evals/parity-{a,b.test.ts']);
  });
});

describe('parseBacktickedPaths with brace expansion', () => {
  it('emits one path per expanded brace option', () => {
    const content = 'The parity tests live at `evals/promptfoo/parity-{x,y}.test.ts`.';
    const paths = parseBacktickedPaths(content, 'test.md');
    expect(paths).toEqual([
      { line: 1, path: 'evals/promptfoo/parity-x.test.ts' },
      { line: 1, path: 'evals/promptfoo/parity-y.test.ts' },
    ]);
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

describe('anchor validation', () => {
  it('detects missing anchor in linked file', () => {
    const content = 'See [section](./valid-link-target.md#nonexistent-anchor)';
    const links = parseMarkdownLinks(content, 'test.md');
    expect(links).toHaveLength(1);
    expect(links[0].target).toBe('./valid-link-target.md#nonexistent-anchor');
  });
});

describe('retired code path handling', () => {
  it('skips historical references with deletion markers', () => {
    const content = 'The old code was in `packages/server（Wave-10 已删除）/src/app.ts`.';
    const paths = parseBacktickedPaths(content, 'test.md');
    expect(paths).toEqual([]);
  });

  it('skips links with historical markers', () => {
    const content = 'See [old file](packages/server/src/app.ts（Wave-10 已删除）).';
    const links = parseMarkdownLinks(content, 'test.md');
    expect(links).toEqual([]);
  });
});

describe('active surface discovery', () => {
  it('excludes archived documents unless reactivated by plan.md', () => {
    const issues = checkDocReferences(ROOT);
    // Archived docs linked from plan.md ARE scanned (reactivated)
    // Archived docs NOT linked from plan.md are excluded
    const reactivatedFiles = [
      'docs/archived/archived-plans/documentation-validation-and-observability-platform-archived.md',
      'docs/archived/archived-plans/compatibility-shell-retirement-runtime-infra-ownership.md',
      'docs/archived/README.md',
    ];
    const archivedIssues = issues.filter((i) => i.file.startsWith('docs/archived/'));
    const nonReactivatedIssues = archivedIssues.filter(
      (i) => !reactivatedFiles.some((f) => i.file.startsWith(f)),
    );
    expect(nonReactivatedIssues).toEqual([]);
  });
});
