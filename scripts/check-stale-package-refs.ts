#!/usr/bin/env tsx

/**
 * Source-aware guard: scans active docs for references to deleted packages
 * that are NOT marked as historical/deleted.
 *
 * Excludes:
 * - docs/archived/**
 * - docs/plans/**
 * - docs/superpowers/**
 * - Lines containing "已删除" or "已退役" or "Wave-10" or "historical"
 *
 * Reports references to packages/server that appear to describe it as
 * current/active authority rather than historical context.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..');

const DELETED_PACKAGES = ['packages/server', 'packages/runtime-infra'];

const EXCLUDED_DIRS = ['docs/archived', 'docs/plans', 'docs/superpowers', 'node_modules', 'dist'];

const HISTORICAL_MARKERS = [
  '已删除',
  '已退役',
  'Wave-10',
  'Wave-9',
  'historical',
  '历史',
  '归档',
  'archived',
  '**已删除**',
  '已于',
  '不再存在',
  '已迁移',
  '已由',
  '已被',
  '已切',
  '已改',
  '~~packages/server~~',
  'compatibility shell',
  '兼容壳',
  '兼容层',
  'compatibility surface',
  'transition',
  '过渡',
  '冻结',
  'freeze',
  'Phase ',
  'deprecated',
  '不再承担',
  '不再描述',
  '不再是',
];

// Section headers that indicate historical/freeze context
const HISTORICAL_SECTION_PATTERNS = [
  /^#+\s*Phase\s+\d/i,
  /^#+\s*~~/,
  /^#+\s*\d+\.\s*Phase/i,
  /^#+\s*.*freeze/i,
  /^#+\s*.*冻结/i,
];

function listMarkdownFiles(dir: string): string[] {
  const results: string[] = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRS.some((excluded) => fullPath.includes(excluded))) {
          results.push(...listMarkdownFiles(fullPath));
        }
      } else if (entry.name.endsWith('.md')) {
        results.push(fullPath);
      }
    }
  } catch {
    // directory doesn't exist
  }
  return results;
}

interface Finding {
  file: string;
  line: number;
  content: string;
  pkg: string;
}

const findings: Finding[] = [];

const docsDir = join(repoRoot, 'docs');
const evalsDir = join(repoRoot, 'evals');
const mdFiles = [
  ...listMarkdownFiles(docsDir),
  ...listMarkdownFiles(evalsDir),
  join(repoRoot, 'README.md'),
];

for (const filePath of mdFiles) {
  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    continue;
  }

  const lines = content.split('\n');
  const relPath = relative(repoRoot, filePath);
  let inHistoricalSection = false;
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Track code blocks
    if (line.trimStart().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    // Track historical sections
    if (line.startsWith('#')) {
      inHistoricalSection = HISTORICAL_SECTION_PATTERNS.some((pattern) => pattern.test(line));
    }

    for (const pkg of DELETED_PACKAGES) {
      if (!line.includes(pkg)) continue;

      // Skip lines in historical sections
      if (inHistoricalSection) continue;

      // Skip lines that are clearly historical
      const isHistorical = HISTORICAL_MARKERS.some((marker) =>
        line.toLowerCase().includes(marker.toLowerCase()),
      );

      if (isHistorical) continue;

      findings.push({
        file: relPath,
        line: i + 1,
        content: line.trim().substring(0, 120),
        pkg,
      });
    }
  }
}

// Threshold: block if count exceeds this (regression detection)
// Threshold: block if count exceeds this (regression detection)
// Cleaned up to 0 on 2026-08-01
const THRESHOLD = 0;

if (findings.length > THRESHOLD) {
  console.error(
    `\n[stale-package-refs] REGRESSION: Found ${findings.length} reference(s) to deleted packages (threshold: ${THRESHOLD})\n`,
  );
  console.error('New stale references were added. Fix them or update the threshold.\n');
  console.error('Fix: either update to current owner package, or add a historical marker\n');
  console.error('  (e.g., "已删除", "Wave-10", "historical", "归档")\n');

  // Group by file
  const byFile = new Map<string, Finding[]>();
  for (const f of findings) {
    const group = byFile.get(f.file) ?? [];
    group.push(f);
    byFile.set(f.file, group);
  }

  for (const [file, group] of byFile) {
    console.error(`  ${file}:`);
    for (const f of group) {
      console.error(`    L${f.line}: ${f.content}`);
    }
  }

  process.exit(1);
} else {
  console.log(
    `[stale-package-refs] OK: ${findings.length} stale reference(s) found (threshold: ${THRESHOLD})`,
  );
  if (findings.length > 0) {
    console.log('  Remaining references are in historical sections. Clean them up over time.');
  }
}
