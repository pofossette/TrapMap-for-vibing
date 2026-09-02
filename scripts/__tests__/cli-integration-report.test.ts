import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { generateSummary } from '../cli-integration-report.js';

describe('cli-integration-report', () => {
  let root: string;
  let out: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'report-root-'));
    out = join(root, 'SUMMARY.md');
    // fake structure: root/A-light/run-01/stats.jsonl etc
    const runDir = join(root, 'A-light', 'run-01');
    mkdirSync(runDir, { recursive: true });
    writeFileSync(join(runDir, 'stats.jsonl'), '{"Name":"trapmap-server","CPUPerc":"5%"}\n');
    writeFileSync(join(runDir, 'health.json'), '{"status":"ok"}');
    writeFileSync(join(runDir, 'metrics.txt'), 'go_goroutines 5');
    writeFileSync(join(runDir, 'df.txt'), 'Images 1');
    writeFileSync(join(runDir, 'host-df.txt'), 'Filesystem 50G');
    writeFileSync(join(runDir, 'cli-timings.jsonl'), '{"cmd":"retrieval search","ms":123}\n');
  });
  afterEach(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {}
  });

  it('generates SUMMARY with tables and mermaid', () => {
    generateSummary({ resultsRoot: root, outPath: out });
    expect(existsSync(out)).toBe(true);
    const md = readFileSync(out, 'utf8');
    expect(md).toContain('CLI Integration SUMMARY');
    expect(md).toContain('A-light');
    expect(md).toContain('run-01');
    expect(md).toContain('xychart-beta');
    expect(md).toContain('Filesystem');
  });

  it('handles empty root', () => {
    const empty = mkdtempSync(join(tmpdir(), 'empty-'));
    const emptyOut = join(empty, 'S.md');
    generateSummary({ resultsRoot: empty, outPath: emptyOut });
    expect(existsSync(emptyOut)).toBe(true);
    const md = readFileSync(emptyOut, 'utf8');
    expect(md).toContain('暂无数据');
    rmSync(empty, { recursive: true, force: true });
  });
});
