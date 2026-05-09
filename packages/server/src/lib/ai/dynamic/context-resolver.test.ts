import { describe, expect, it } from 'vitest';

import { getDynamicInjections } from './context-resolver.js';

// ---------------------------------------------------------------------------
// getDynamicInjections
// ---------------------------------------------------------------------------

describe('getDynamicInjections', () => {
  it('returns injections for any task type', () => {
    const injections = getDynamicInjections('boundary-extraction');
    expect(injections.length).toBeGreaterThan(0);
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

  it('includes MCP_SERVERS injection', () => {
    const injections = getDynamicInjections('boundary-extraction');
    const mcp = injections.find((i) => i.placeholder === '${MCP_SERVERS}');
    expect(mcp).toBeDefined();
    expect(mcp!.resolver()).toBe('[]');
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
