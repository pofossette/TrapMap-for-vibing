import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadMcpConfig } from '../config.js';
import { allTools } from './registry.js';

const config = loadMcpConfig({ TRAPMAP_ACCESS_TOKEN: 'test-token' });
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function callTool(name: string, args: unknown) {
  const tool = allTools.find((t) => t.name === name);
  if (!tool) throw new Error(`tool ${name} not registered`);
  return tool.handler(args as Record<string, unknown>, {
    config,
    logger: { info: () => {}, error: () => {} },
  }) as Promise<unknown>;
}

function stubCapture() {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = vi.fn(async (input: string | URL | RequestInfo, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify({ ok: true, id: 'x-1' }), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  return calls;
}

describe('B4 draft write tools', () => {
  it('trapmap_submit_knowledge posts to /v1/knowledge without lifecycle_state or actorId', async () => {
    const calls = stubCapture();
    await callTool('trapmap_submit_knowledge', {
      title: 'T',
      content: 'C',
      labels: ['a'],
      teamId: 'team-1',
    });
    const body = JSON.parse(String(calls[0]?.init?.body));
    expect(calls[0]?.url).toBe('http://127.0.0.1:4000/v1/knowledge');
    expect(body).toEqual({ title: 'T', content: 'C', labels: ['a'], teamId: 'team-1' });
    expect(body).not.toHaveProperty('lifecycle_state');
    expect(body).not.toHaveProperty('actorId');
  });

  it('strict schema rejects smuggled lifecycle_state/actorId on all write tools', async () => {
    await expect(
      callTool('trapmap_submit_knowledge', {
        title: 'T',
        content: 'C',
        lifecycle_state: 'approved',
      }),
    ).rejects.toThrow();
    await expect(
      callTool('trapmap_submit_feedback', {
        entryId: 'e',
        problemType: 'p',
        description: 'd',
        actorId: 'impersonator',
      }),
    ).rejects.toThrow();
    await expect(
      callTool('trapmap_submit_skill_draft', {
        slug: 's',
        title: 't',
        files: [{ path: 'SKILL.md', content: 'x' }],
        lifecycle_state: 'approved',
      }),
    ).rejects.toThrow();
  });

  it('trapmap_submit_skill_draft wraps files into a pending-review bundle', async () => {
    const calls = stubCapture();
    await callTool('trapmap_submit_skill_draft', {
      slug: 'my-skill',
      title: 'My Skill',
      files: [
        { path: 'SKILL.md', content: '# s' },
        { path: 'scripts/run.sh', content: 'echo' },
      ],
    });
    const body = JSON.parse(String(calls[0]?.init?.body));
    expect(calls[0]?.url).toBe('http://127.0.0.1:4000/v1/operations/artifacts/import');
    expect(body.bundles[0]).toMatchObject({ slug: 'my-skill', title: 'My Skill' });
    expect(body.bundles[0].files[0]).toMatchObject({ path: 'SKILL.md', kind: 'doc' });
    expect(body.bundles[0].files[1]).toMatchObject({ path: 'scripts/run.sh', kind: 'script' });
  });

  it('trapmap_submit_feedback posts the canonical feedback body', async () => {
    const calls = stubCapture();
    await callTool('trapmap_submit_feedback', {
      entryId: 'e-1',
      problemType: 'outdated',
      description: 'fix',
    });
    expect(calls[0]?.url).toBe('http://127.0.0.1:4000/v1/feedback');
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      entryId: 'e-1',
      problemType: 'outdated',
      description: 'fix',
    });
  });

  it('all write tools require contributor role (never viewer)', () => {
    for (const name of [
      'trapmap_submit_knowledge',
      'trapmap_submit_skill_draft',
      'trapmap_submit_feedback',
    ]) {
      expect(allTools.find((t) => t.name === name)?.requiredRole).toBe('contributor');
    }
  });
});
