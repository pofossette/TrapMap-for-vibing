import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// We test collectOnce by injecting execSync behavior via vi.mock on node:child_process
// Since ES mocking is tricky, we test via subprocess injection: override execSync by mocking child_process

vi.mock('node:child_process', async (importOriginal) => {
  const orig = (await importOriginal()) as Record<string, unknown>;
  return {
    ...orig,
    execSync: vi.fn((cmd: string) => {
      if (cmd.includes('docker stats'))
        return '{"ID":"abc","Name":"trapmap-gateway","CPUPerc":"2.34%","MemUsage":"120MiB / 1GiB"}\n';
      if (cmd.includes('docker system df')) return 'Images 1 1 1.2GB 0B\n';
      if (cmd.includes('df -h')) return 'Filesystem Size Used\n/dev/sda 50G 10G\n';
      if (cmd.includes('curl -s http://127.0.0.1:4000/health')) return '{"status":"ok"}';
      if (cmd.includes('curl -s http://127.0.0.1:4000/ready')) return '{"ready":true}';
      if (cmd.includes('curl -s http://127.0.0.1:4101/metrics')) return '# HELP go_goroutines\n';
      if (cmd.includes('pg_database_size')) return ' pg_database_size | 12345\n';
      return 'ok';
    }),
  };
});

import { collectOnce } from '../cli-integration-collect.js';

describe('cli-integration-collect', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'collect-test-'));
  });
  afterEach(() => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {}
  });

  it('writes all expected files', () => {
    collectOnce({ outDir: dir });
    expect(existsSync(join(dir, 'stats.jsonl'))).toBe(true);
    expect(existsSync(join(dir, 'df.json'))).toBe(true);
    expect(existsSync(join(dir, 'df.txt'))).toBe(true);
    expect(existsSync(join(dir, 'host-df.txt'))).toBe(true);
    expect(existsSync(join(dir, 'health.json'))).toBe(true);
    expect(existsSync(join(dir, 'ready.json'))).toBe(true);
    expect(existsSync(join(dir, 'metrics.txt'))).toBe(true);
    expect(existsSync(join(dir, 'pg-size.txt'))).toBe(true);
    expect(existsSync(join(dir, 'collected-at.txt'))).toBe(true);
  });

  it('stats.jsonl contains mocked container', () => {
    collectOnce({ outDir: dir });
    const raw = readFileSync(join(dir, 'stats.jsonl'), 'utf8');
    expect(raw).toContain('trapmap-gateway');
  });

  it('health.json parses as json', () => {
    collectOnce({ outDir: dir });
    const raw = readFileSync(join(dir, 'health.json'), 'utf8');
    expect(() => JSON.parse(raw)).not.toThrow();
  });
});
