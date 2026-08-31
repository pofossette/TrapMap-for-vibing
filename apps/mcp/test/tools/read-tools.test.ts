import { afterEach, describe, expect, it, vi } from 'vitest';

import { effectivePolicy } from '../../src/tools/skill-files.js';
import { makeToolCaller } from '../../src/tools/tool-caller.js';

const callTool = makeToolCaller('viewer');

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  delete process.env.TRAPMAP_MCP_SCRIPT_POLICY;
});

const originalFetch = globalThis.fetch;

function stubFetch(handler: (input: string, init?: RequestInit) => Response | Promise<Response>) {
  const fetchMock = vi.fn(async (input: string | URL | RequestInfo, init?: RequestInit) =>
    handler(String(input), init),
  );
  globalThis.fetch = fetchMock as typeof fetch;
  return fetchMock;
}

describe('trapmap_search_knowledge', () => {
  it('POSTs to /v1/retrieval/search with bearer auth and the query body', async () => {
    const fetchMock = stubFetch((input, init) => {
      expect(input).toBe('http://127.0.0.1:4000/v1/retrieval/search');
      expect((init?.headers as Record<string, string>).authorization).toBe('Bearer test-token');
      expect(JSON.parse(String(init?.body))).toEqual({ query: 'jwt', limit: 5 });
      return new Response(JSON.stringify({ results: [{ id: 'e1' }] }), { status: 200 });
    });

    const result = await callTool('trapmap_search_knowledge', { query: 'jwt', limit: 5 });
    expect(result).toEqual({ results: [{ id: 'e1' }] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects empty queries via strict schema', async () => {
    await expect(callTool('trapmap_search_knowledge', { query: '' })).rejects.toThrow();
    await expect(
      callTool('trapmap_search_knowledge', { query: 'x', lifecycle_state: 'approved' }),
    ).rejects.toThrow();
  });

  it('surfaces gateway errors as GatewayHttpError with payload', async () => {
    stubFetch(
      () => new Response(JSON.stringify({ error: 'unauthorized', kind: 'auth' }), { status: 401 }),
    );
    await expect(callTool('trapmap_search_knowledge', { query: 'x' })).rejects.toMatchObject({
      name: 'GatewayHttpError',
      statusCode: 401,
    });
  });
});

describe('trapmap_get_skill_manifest', () => {
  it('returns a content-stripped manifest view of the exported bundle', async () => {
    stubFetch(
      () =>
        new Response(
          JSON.stringify([
            {
              id: 'artifact-1',
              title: 'JWT skill',
              files: [
                { path: 'SKILL.md', kind: 'doc', content: '# secret body' },
                { path: 'references/a.md', kind: 'reference', content: 'more' },
              ],
            },
          ]),
          { status: 200 },
        ),
    );

    const manifest = (await callTool('trapmap_get_skill_manifest', {
      artifactId: 'artifact-1',
    })) as {
      files: Array<Record<string, unknown>>;
    };
    expect(manifest.title).toBe('JWT skill');
    expect(manifest.files).toHaveLength(2);
    for (const file of manifest.files) {
      expect(file).not.toHaveProperty('content');
    }
  });

  it('throws when the artifact does not exist', async () => {
    stubFetch(() => new Response(JSON.stringify([]), { status: 200 }));
    await expect(callTool('trapmap_get_skill_manifest', { artifactId: 'missing' })).rejects.toThrow(
      /not found/i,
    );
  });
});

describe('effectivePolicy (four-state activation policy)', () => {
  it('takes the stricter side of server default and local override', () => {
    delete process.env.TRAPMAP_MCP_SCRIPT_POLICY;
    expect(effectivePolicy('client-executable')).toBe('client-executable');
    process.env.TRAPMAP_MCP_SCRIPT_POLICY = 'blocked';
    expect(effectivePolicy('client-executable')).toBe('blocked');
    process.env.TRAPMAP_MCP_SCRIPT_POLICY = 'client-executable';
    expect(effectivePolicy('needs-approval')).toBe('needs-approval');
  });

  it('degrades unknown server values to reference-only', () => {
    delete process.env.TRAPMAP_MCP_SCRIPT_POLICY;
    expect(effectivePolicy('mystery-value')).toBe('reference-only');
    expect(effectivePolicy(undefined)).toBe('reference-only');
  });
});

describe('trapmap_read_skill_files', () => {
  function bundleResponse() {
    return new Response(
      JSON.stringify([
        {
          id: 'artifact-9',
          files: [
            { path: 'SKILL.md', kind: 'doc', content: '# hello' },
            { path: 'scripts/go.sh', kind: 'script', content: 'echo hi' },
            { path: 'locked.md', kind: 'doc', content: 'nope', activationOnly: true },
          ],
        },
      ]),
      { status: 200 },
    );
  }

  it('delivers requested files and enforces blocked/activation-only paths', async () => {
    stubFetch(() => bundleResponse());
    const result = (await callTool('trapmap_read_skill_files', {
      artifactId: 'artifact-9',
      paths: ['SKILL.md', 'locked.md'],
    })) as {
      files: Array<{ path: string; effectivePolicy: string; content?: string }>;
      skipped: Array<{ path: string; reason: string }>;
    };
    expect(result.files).toHaveLength(1);
    expect(result.files[0]?.path).toBe('SKILL.md');
    expect(result.files[0]?.content).toBe('# hello');
    expect(result.skipped).toEqual([{ path: 'locked.md', reason: 'blocked by activation policy' }]);
  });

  it('marks scripts with their effective policy (server needs-approval by default)', async () => {
    delete process.env.TRAPMAP_MCP_SCRIPT_POLICY;
    stubFetch(() => bundleResponse());
    const result = (await callTool('trapmap_read_skill_files', {
      artifactId: 'artifact-9',
      paths: ['scripts/go.sh'],
    })) as { files: Array<{ path: string; effectivePolicy: string }> };
    expect(result.files[0]?.effectivePolicy).toBe('needs-approval');
  });

  it('reports requested paths missing from the bundle', async () => {
    stubFetch(() => bundleResponse());
    const result = (await callTool('trapmap_read_skill_files', {
      artifactId: 'artifact-9',
      paths: ['absent.md'],
    })) as { files: unknown[]; skipped: Array<{ path: string; reason: string }> };
    expect(result.files).toHaveLength(0);
    expect(result.skipped[0]).toMatchObject({ path: 'absent.md' });
  });
});
