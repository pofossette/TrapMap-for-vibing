import { describe, expect, it, vi } from 'vitest';
import { createAuditLogger } from './audit.js';

describe('audit logger', () => {
  it('emits structured ok/error lines without free-form content', async () => {
    const lines: string[] = [];
    const logger = createAuditLogger((line) => lines.push(line));
    const span = logger.toolSpan('trapmap_search_knowledge');
    span.ok();
    span.fail();
    expect(lines).toHaveLength(2);
    const records = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(records[0]).toMatchObject({ tool: 'trapmap_search_knowledge', outcome: 'ok' });
    expect(records[1]).toMatchObject({ outcome: 'error' });
    for (const record of records) {
      expect(typeof record.correlationId).toBe('string');
      expect(typeof record.durationMs).toBe('number');
    }
  });

  it('never leaks credentials or handler content into the audit stream', async () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const logger = createAuditLogger();
    const span = logger.toolSpan('trapmap_read_skill_files');
    try {
      throw new Error('failed while reading SKILL.md with secret-token abc123');
    } catch (err) {
      span.fail();
      void err;
    }
    const written = stderrSpy.mock.calls.map((call) => String(call[0])).join('');
    expect(written).toContain('"outcome":"error"');
    expect(written).not.toContain('secret-token');
    expect(written).not.toContain('SKILL.md');
    stderrSpy.mockRestore();
  });
});
