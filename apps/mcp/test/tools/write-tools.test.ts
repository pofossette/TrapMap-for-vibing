import { afterEach, describe, expect, it, vi } from 'vitest';

import { allTools } from '../../src/tools/registry.js';

import { stubFetchCapture } from '../../src/tools/stub-fetch.js';
import { makeToolCaller } from '../../src/tools/tool-caller.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('B4 draft write tools', () => {
  it('trapmap_submit_knowledge posts to /v1/knowledge without lifecycle_state or actorId', async () => {
    const calls = stubFetchCapture();
    await makeToolCaller('contributor')('trapmap_submit_knowledge', {
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
      makeToolCaller('contributor')('trapmap_submit_knowledge', {
        title: 'T',
        content: 'C',
        lifecycle_state: 'approved',
      }),
    ).rejects.toThrow();
    await expect(
      makeToolCaller('contributor')('trapmap_submit_feedback', {
        entryId: 'e',
        problemType: 'p',
        description: 'd',
        actorId: 'impersonator',
      }),
    ).rejects.toThrow();
    await expect(
      makeToolCaller('contributor')('trapmap_submit_skill_draft', {
        slug: 's',
        title: 't',
        files: [{ path: 'SKILL.md', content: 'x' }],
        lifecycle_state: 'approved',
      }),
    ).rejects.toThrow();
  });

  it('trapmap_submit_skill_draft wraps files into a pending-review bundle', async () => {
    const calls = stubFetchCapture();
    await makeToolCaller('contributor')('trapmap_submit_skill_draft', {
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
    const calls = stubFetchCapture();
    await makeToolCaller('contributor')('trapmap_submit_feedback', {
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
