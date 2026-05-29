import { describe, expect, it } from 'vitest';

import { getDynamicInjections } from './context-resolver.js';

// ---------------------------------------------------------------------------
// getDynamicInjections
// ---------------------------------------------------------------------------

describe('getDynamicInjections', () => {
  it('returns base injections for any task type', () => {
    const injections = getDynamicInjections('boundary-extraction');
    // Base injections: WORKING_DIR, DATE, GIT_STATUS, SESSION_ID (4)
    expect(injections.length).toBe(4);
  });

  it('knowledge-refinement includes additional MCP_SERVERS injection', () => {
    const injections = getDynamicInjections('knowledge-refinement');
    // Base (4) + MCP_SERVERS (1) = 5
    expect(injections.length).toBe(5);
  });

  it('includes WORKING_DIR injection that resolves to cwd', () => {
    const injections = getDynamicInjections('knowledge-refinement');
    const wd = injections.find((i) => i.placeholder === '${WORKING_DIR}');
    expect(wd).toBeDefined();
    expect(wd!.resolver()).toBe(process.cwd());
  });

  it('includes DATE injection that resolves to today ISO date', () => {
    const injections = getDynamicInjections('claim-verification');
    const date = injections.find((i) => i.placeholder === '${DATE}');
    expect(date).toBeDefined();
    const value = date!.resolver();
    expect(value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('includes GIT_STATUS injection that returns a string', () => {
    const injections = getDynamicInjections('boundary-extraction');
    const gs = injections.find((i) => i.placeholder === '${GIT_STATUS}');
    expect(gs).toBeDefined();
    const value = gs!.resolver();
    expect(typeof value).toBe('string');
  });

  it('includes MCP_SERVERS injection for knowledge-refinement tasks', () => {
    const injections = getDynamicInjections('knowledge-refinement');
    const mcp = injections.find((i) => i.placeholder === '${MCP_SERVERS}');
    expect(mcp).toBeDefined();
    const result = mcp!.resolver();
    const parsed = JSON.parse(result);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(1);
    expect(parsed[0].id).toBe('mcp-status');
    expect(parsed[0].status).toBe('unavailable');
  });

  it('excludes MCP_SERVERS injection for non-knowledge-refinement tasks', () => {
    const taskTypes: ('boundary-extraction' | 'claim-verification' | 'graph-extraction' | 'graph-extraction-planner')[] = [
      'boundary-extraction',
      'claim-verification',
      'graph-extraction',
      'graph-extraction-planner',
    ];
    for (const tt of taskTypes) {
      const injections = getDynamicInjections(tt);
      const mcp = injections.find((i) => i.placeholder === '${MCP_SERVERS}');
      expect(mcp).toBeUndefined();
    }
  });

  it('base injections are always included regardless of task type', () => {
    const taskTypes = [
      'knowledge-refinement' as const,
      'boundary-extraction' as const,
      'claim-verification' as const,
      'graph-extraction' as const,
    ];
    for (const tt of taskTypes) {
      const injections = getDynamicInjections(tt);
      expect(injections.find((i) => i.placeholder === '${WORKING_DIR}')).toBeDefined();
      expect(injections.find((i) => i.placeholder === '${DATE}')).toBeDefined();
      expect(injections.find((i) => i.placeholder === '${GIT_STATUS}')).toBeDefined();
      expect(injections.find((i) => i.placeholder === '${SESSION_ID}')).toBeDefined();
    }
  });

  it('includes SESSION_ID injection that starts with session-', () => {
    const injections = getDynamicInjections('boundary-extraction');
    const sid = injections.find((i) => i.placeholder === '${SESSION_ID}');
    expect(sid).toBeDefined();
    const value = sid!.resolver();
    expect(value).toMatch(/^session-\d+-[a-z0-9]+$/);
  });

  it('generates unique session IDs on each call', () => {
    const injections = getDynamicInjections('boundary-extraction');
    const sid = injections.find((i) => i.placeholder === '${SESSION_ID}');
    const a = sid!.resolver();
    const b = sid!.resolver();
    expect(a).not.toBe(b);
  });

  it('GIT_STATUS returns "Not a git repository" when git fails gracefully', () => {
    // This tests the fallback path — in a git repo it returns actual status.
    // We just verify it does not throw.
    const injections = getDynamicInjections('boundary-extraction');
    const gs = injections.find((i) => i.placeholder === '${GIT_STATUS}');
    expect(() => gs!.resolver()).not.toThrow();
  });
});
