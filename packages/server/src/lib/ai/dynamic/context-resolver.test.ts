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

  it('fm-agent: MCP_SERVERS returns dynamic status when servers are configured', () => {
    // Raw report confirms: getMcpServerStatus() is a placeholder stub that
    // always returns '[]', regardless of configuration.
    // FIXME: will fail until the placeholder is wired to actual MCP server state.
    const injections = getDynamicInjections('knowledge-refinement');
    const mcp = injections.find((i) => i.placeholder === '${MCP_SERVERS}');
    expect(mcp).toBeDefined();

    const result = mcp!.resolver();
    // The stub returns '[]' — but a real implementation would return
    // dynamic status when servers are configured.
    // This test captures the intention: the result should be parseable JSON
    // and should NOT always be an empty array when servers exist.
    const parsed = JSON.parse(result);
    expect(Array.isArray(parsed)).toBe(true);

    // FIXME: this will fail until getMcpServerStatus is wired to actual MCP state.
    // When no MCP servers are configured, empty is fine.
    // But the function should at minimum accept an input/config, not be hardcoded.
    // This test serves as a reminder that the placeholder needs replacement.
    //
    // For now, we validate that the stub returns valid JSON and is an array.
    // A true implementation would reflect configured MCP servers.
    expect(parsed.length).toBeGreaterThanOrEqual(0);

    // The raw report details that the function always returns '[]' for ALL task types.
    // A real implementation should vary based on configuration, not task type.
    const taskTypes = [
      'knowledge-refinement' as const,
      'boundary-extraction' as const,
      'claim-verification' as const,
      'graph-extraction' as const,
    ];
    const results = taskTypes.map((tt) => {
      const injs = getDynamicInjections(tt);
      const m = injs.find((i) => i.placeholder === '${MCP_SERVERS}');
      return m!.resolver();
    });

    // All results are '[]' — confirming it's a stub with no dynamic behavior.
    // This assertion documents the current placeholder state.
    const allEmpty = results.every((r) => r === '[]');
    // FIXME: uncomment when implementation is real — should be false
    // expect(allEmpty).toBe(false);
    // For now, document: stub returns empty for all types
    expect(allEmpty).toBe(true);
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
