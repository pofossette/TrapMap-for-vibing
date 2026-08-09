import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  formatExemptionDoc,
  parseExemptions,
  scanContent,
  scanRepository,
} from '../check-naked-asserts';

const tempDirs: string[] = [];
function makeTempRepo(): string {
  const repoRoot = mkdtempSync(join(tmpdir(), 'trapmap-naked-asserts-'));
  tempDirs.push(repoRoot);
  return repoRoot;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    void import('node:fs/promises').then(({ rm }) => rm(dir, { recursive: true, force: true }));
  }
});

describe('scanContent', () => {
  it('flags `as never`', () => {
    const findings = scanContent('const x = y as never;\n');
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ line: 1, kind: 'as never' });
  });

  it('flags `as never[]` array casts', () => {
    const findings = scanContent('return rows.map(mapRow) as never[];\n');
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe('as never');
  });

  it('flags `as unknown as` double casts', () => {
    const findings = scanContent('const x = y as unknown as Foo;\n');
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ line: 1, kind: 'as unknown as' });
  });

  it('flags @ts-ignore and @ts-expect-error', () => {
    expect(scanContent('// @ts-ignore\nconst x = y;\n')).toEqual([
      { file: '', line: 1, kind: '@ts-ignore' },
    ]);
    expect(scanContent('// @ts-expect-error\nconst x = y;\n')).toEqual([
      { file: '', line: 1, kind: '@ts-expect-error' },
    ]);
  });

  it('reports multiple findings on one line', () => {
    const findings = scanContent('const x = y as unknown as Foo as never;\n');
    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.kind)).toEqual(['as unknown as', 'as never']);
  });

  it('reports findings on multiple lines with correct line numbers', () => {
    const findings = scanContent('const a = 1;\nconst b = x as never;\nconst c = 2;\n');
    expect(findings).toHaveLength(1);
    expect(findings[0].line).toBe(2);
  });

  it('does NOT flag `as const`', () => {
    expect(scanContent('const x = { a: 1 } as const;\n')).toEqual([]);
  });

  it('does NOT flag explicit narrowing casts (`as string` etc.)', () => {
    expect(scanContent('const s = value as string;\nconst n = value as number;\n')).toEqual([]);
  });

  it('does NOT flag lines annotated with `// lib type gap:`', () => {
    expect(
      scanContent('const x = y as unknown as Foo; // lib type gap: third-party types\n'),
    ).toEqual([]);
  });

  it('skips full-line comments mentioning as never', () => {
    expect(scanContent('// never use: x as never\nconst a = 1;\n')).toEqual([]);
  });

  it('skips block comment bodies mentioning as never', () => {
    const content = '/*\n * example: value as never\n */\nconst a = 1;\n';
    expect(scanContent(content)).toEqual([]);
  });

  it('flags after a block comment closes', () => {
    const content = '/* closed */\nconst a = y as never;\n';
    expect(scanContent(content)).toHaveLength(1);
  });

  it('does NOT flag `satisfies never`', () => {
    expect(scanContent('const x = y satisfies never;\n')).toEqual([]);
  });
});

describe('parseExemptions', () => {
  it('parses file:line entries from the document', () => {
    const doc = [
      '# header',
      '',
      '### packages/foo/src/bar.ts',
      '- 3: `as never`',
      '- 7: `as unknown as`',
      '',
      '### packages/foo/src/baz.ts',
      '- 1: `as never`',
    ].join('\n');
    const keys = parseExemptions(doc);
    expect(keys).toEqual(
      new Set([
        'packages/foo/src/bar.ts:3',
        'packages/foo/src/bar.ts:7',
        'packages/foo/src/baz.ts:1',
      ]),
    );
  });

  it('ignores non-matching lines', () => {
    const keys = parseExemptions('# just a header\n\nno entries here\n');
    expect(keys.size).toBe(0);
  });
});

describe('formatExemptionDoc', () => {
  it('groups findings by file with counts', () => {
    const doc = formatExemptionDoc([
      { file: 'packages/a/src/x.ts', line: 1, kind: 'as never' },
      { file: 'packages/a/src/x.ts', line: 4, kind: 'as unknown as' },
      { file: 'packages/b/src/y.ts', line: 2, kind: 'as never' },
    ]);
    expect(doc).toContain('- 总条目：3 处');
    expect(doc).toContain('- 文件数：2');
    expect(doc).toContain('### packages/a/src/x.ts');
    expect(doc).toContain('- 1: `as never`');
    expect(doc).toContain('- 4: `as unknown as`');
    expect(doc).toContain('### packages/b/src/y.ts');
  });

  it('round-trips through parseExemptions', () => {
    const findings = [
      { file: 'packages/a/src/x.ts', line: 1, kind: 'as never' },
      { file: 'packages/a/src/x.ts', line: 4, kind: 'as unknown as' },
      { file: 'packages/b/src/y.ts', line: 2, kind: 'as never' },
    ];
    const keys = parseExemptions(formatExemptionDoc(findings));
    expect(keys).toEqual(
      new Set(['packages/a/src/x.ts:1', 'packages/a/src/x.ts:4', 'packages/b/src/y.ts:2']),
    );
  });
});

describe('scanRepository', () => {
  it('scans packages/**/src/**/*.ts and returns repo-relative paths', async () => {
    const repoRoot = makeTempRepo();
    const write = (rel: string, content: string) => {
      const abs = join(repoRoot, rel);
      mkdirSync(join(abs, '..'), { recursive: true });
      writeFileSync(abs, content);
    };
    write('packages/foo/src/a.ts', 'const x = y as never;\n');
    write('packages/foo/src/a.test.ts', 'const x = y as unknown as Foo;\n');
    write('packages/foo/src/ok.ts', 'const x = y as string;\n');
    write('packages/foo/src/nested/deep.ts', 'const x = y as never;\n');
    write('packages/foo/other.ts', 'const x = y as never;\n');

    const findings = await scanRepository(repoRoot);
    const keys = findings.map((f) => `${f.file}:${f.line}`).sort();
    expect(keys).toEqual([
      'packages/foo/src/a.test.ts:1',
      'packages/foo/src/a.ts:1',
      'packages/foo/src/nested/deep.ts:1',
    ]);
  });
});
