#!/usr/bin/env tsx

/**
 * Naked type-assertion guard (Wave 0 门禁).
 *
 * Scans every TypeScript file under each package's `src/` directory
 * (all packages, including tests) and flags naked type assertions:
 *   - `as never`
 *   - `as unknown as`
 *   - `@ts-ignore`
 *   - `@ts-expect-error`
 *
 * Not flagged:
 *   - `as const` and explicit narrowing casts (`as string` etc.)
 *   - lines annotated with `// lib type gap:` (documented third-party gaps)
 *   - comment lines / block comment contents
 *
 * The exemption list (`docs/todos/assert-exemptions.md`) tracks the existing
 * Wave-6 clearing backlog. Lines registered there are skipped, so the guard
 * only fails on NEW naked assertions.
 *
 * Usage:
 *   pnpm exec tsx scripts/check-naked-asserts.ts            # guard mode (exit 1 on new findings)
 *   pnpm exec tsx scripts/check-naked-asserts.ts --record   # regenerate the exemption list
 *   pnpm exec tsx scripts/check-naked-asserts.ts --exemptions <path>  # custom list path
 */

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';

export interface NakedAssertFinding {
  file: string;
  line: number;
  kind: string;
}

const NAKED_CAST_RE = /as never\b|as unknown as\b/g;
const TS_SUPPRESS_RE = /@ts-ignore\b|@ts-expect-error\b/g;
const LIB_TYPE_GAP_MARKER = 'lib type gap:';
const DEFAULT_EXEMPTIONS_PATH = 'docs/todos/assert-exemptions.md';

export const NAKED_ASSERT_KINDS = [
  'as never',
  'as unknown as',
  '@ts-ignore',
  '@ts-expect-error',
] as const;

/**
 * Scan a single file's content for naked assertions.
 * `@ts-ignore` / `@ts-expect-error` are comment directives, so they are
 * flagged regardless of comment-ness. `as never` / `as unknown as` inside
 * comment lines and block-comment bodies are skipped. A line annotated with
 * `// lib type gap:` is never flagged.
 */
export function scanContent(content: string): NakedAssertFinding[] {
  const findings: NakedAssertFinding[] = [];
  const lines = content.split('\n');
  let inBlockComment = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const lineNumber = i + 1;
    const trimmed = line.trim();

    if (line.includes(LIB_TYPE_GAP_MARKER)) continue;

    for (const kind of matchAll(TS_SUPPRESS_RE, line)) {
      findings.push({ file: '', line: lineNumber, kind });
    }

    if (inBlockComment) {
      if (line.includes('*/')) inBlockComment = false;
      continue;
    }
    if (trimmed.startsWith('//') || trimmed.startsWith('/*')) {
      if (trimmed.startsWith('/*') && !line.includes('*/')) inBlockComment = true;
      continue;
    }
    if (trimmed.startsWith('*')) continue;

    for (const kind of matchAll(NAKED_CAST_RE, line)) {
      findings.push({ file: '', line: lineNumber, kind });
    }
  }
  return findings;
}

function matchAll(re: RegExp, line: string): string[] {
  const kinds: string[] = [];
  let match: RegExpExecArray | null;
  do {
    match = re.exec(line);
    if (match) kinds.push(match[0]);
  } while (match);
  return kinds;
}

/**
 * Parse the exemption list document. Section headers (`### path`) combined
 * with bullet line numbers (`- 12: ...`) yield `path:line` keys; flat
 * `path:line:` entries are also accepted.
 */
export function parseExemptions(content: string): Set<string> {
  const keys = new Set<string>();
  let currentFile = '';
  for (const line of content.split('\n')) {
    const header = line.match(/^### (\S+)$/);
    if (header) {
      currentFile = header[1] ?? '';
      continue;
    }
    const flat = line.match(/^([\w./-]+\.ts):(\d+):/);
    if (flat) {
      keys.add(`${flat[1]}:${flat[2]}`);
      continue;
    }
    const bullet = line.match(/^- (\d+):/);
    if (bullet && currentFile) {
      keys.add(`${currentFile}:${bullet[1]}`);
    }
  }
  return keys;
}

/**
 * Render the exemption list document, grouped by file with per-line counts.
 */
export function formatExemptionDoc(findings: NakedAssertFinding[]): string {
  const byFile = new Map<string, NakedAssertFinding[]>();
  for (const f of findings) {
    const group = byFile.get(f.file) ?? [];
    group.push(f);
    byFile.set(f.file, group);
  }

  const lines: string[] = [
    '# 裸类型断言豁免清单（Wave 6 清理积压）',
    '',
    '> 由 `pnpm exec tsx scripts/check-naked-asserts.ts --record` 自动生成，不要手动编辑。',
    '> 本清单只追踪存量裸断言（`as never` / `as unknown as` / `@ts-ignore` / `@ts-expect-error`），',
    '> 由 Wave 6 统一清理。新代码禁止新增裸断言，门禁见 `pnpm check:asserts`。',
    '',
    '## 统计',
    '',
    `- 总条目：${findings.length} 处`,
    `- 文件数：${byFile.size}`,
    '',
    '## 清单',
    '',
  ];

  const sortedFiles = [...byFile.keys()].sort();
  for (const file of sortedFiles) {
    lines.push(`### ${file}`);
    lines.push('');
    for (const f of byFile.get(file) ?? []) {
      lines.push(`- ${f.line}: \`${f.kind}\``);
    }
    lines.push('');
  }

  return lines.join('\n');
}

async function collectTsFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectTsFiles(fullPath)));
    } else if (extname(entry.name) === '.ts') {
      files.push(fullPath);
    }
  }
  return files;
}

export async function scanRepository(repoRoot: string): Promise<NakedAssertFinding[]> {
  const findings: NakedAssertFinding[] = [];
  const packagesDir = join(repoRoot, 'packages');
  const packageDirs = await readdir(packagesDir, { withFileTypes: true }).catch(() => []);
  for (const pkg of packageDirs) {
    if (!pkg.isDirectory()) continue;
    const srcDir = join(packagesDir, pkg.name, 'src');
    const tsFiles = await collectTsFiles(srcDir);
    for (const absPath of tsFiles) {
      const content = await readFile(absPath, 'utf8');
      const relPath = relative(repoRoot, absPath);
      for (const finding of scanContent(content)) {
        findings.push({ ...finding, file: relPath });
      }
    }
  }
  return findings;
}

async function main() {
  const args = process.argv.slice(2);
  const recordMode = args.includes('--record');
  const exemptionsFlag = args.find((a) => a.startsWith('--exemptions='));
  const exemptionsPath = exemptionsFlag?.split('=', 2)[1] ?? DEFAULT_EXEMPTIONS_PATH;

  const repoRoot = resolve(import.meta.dirname, '..');
  const findings = await scanRepository(repoRoot);

  if (recordMode) {
    const docPath = join(repoRoot, exemptionsPath);
    await writeFile(docPath, formatExemptionDoc(findings), 'utf8');
    console.log(`[naked-asserts] record: wrote ${findings.length} finding(s) to ${exemptionsPath}`);
    process.exit(0);
  }

  const exemptions = parseExemptions(await readFile(join(repoRoot, exemptionsPath), 'utf8'));
  const violations = findings.filter((f) => !exemptions.has(`${f.file}:${f.line}`));

  if (violations.length === 0) {
    console.log(
      `[naked-asserts] OK: ${findings.length} naked assertion(s) found, all covered by ${exemptionsPath}`,
    );
    process.exit(0);
  }

  console.error(
    `[naked-asserts] FAIL: ${violations.length} new naked assertion(s) outside the exemption list:\n`,
  );
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  ${v.kind}`);
  }
  console.error('\nFix: either remove the naked assertion, or (existing backlog only) re-run:\n');
  console.error('  pnpm exec tsx scripts/check-naked-asserts.ts --record\n');
  process.exit(1);
}

// Only run when executed directly, not when imported (e.g. by tests).
const isDirectRun = !process.env.VITEST && process.argv[1]?.includes('check-naked-asserts');
if (isDirectRun) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
