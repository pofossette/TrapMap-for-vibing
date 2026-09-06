import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  assertRole,
  PermissionDeniedError,
  type Role,
  resolveSessionRole,
} from '../../src/permissions.js';
import { allTools } from '../../src/tools/registry.js';
import { stubFetchCapture } from '../../src/tools/stub-fetch.js';
import { makeToolCaller } from '../../src/tools/tool-caller.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  process.env.TRAPMAP_MCP_ROLE = undefined;
});

const _callToolAs = makeToolCaller();

describe('resolveSessionRole', () => {
  it('defaults to viewer (deny-by-default)', () => {
    expect(resolveSessionRole({})).toBe('viewer');
    expect(resolveSessionRole({ TRAPMAP_MCP_ROLE: 'hacker' })).toBe('viewer');
  });

  it('accepts valid roles from env', () => {
    expect(resolveSessionRole({ TRAPMAP_MCP_ROLE: 'operator' })).toBe('operator');
  });
});

describe('assertRole matrix (session role → required tool role)', () => {
  const matrix: Array<[actual: Role, required: Role, allowed: boolean]> = [
    ['viewer', 'viewer', true],
    ['viewer', 'contributor', false],
    ['contributor', 'contributor', true],
    ['reviewer', 'contributor', true],
    ['reviewer', 'operator', false],
    ['operator', 'operator', true],
    ['contributor', 'reviewer', false],
  ];
  it.each(matrix)('%s session calling %s-level tool → allowed=%s', (actual, required, allowed) => {
    if (allowed) {
      expect(() => assertRole(actual, required)).not.toThrow();
    } else {
      expect(() => assertRole(actual, required)).toThrow(PermissionDeniedError);
    }
  });

  it('denial happens with zero network calls at the wrapper level', () => {
    let networkCalls = 0;
    globalThis.fetch = vi.fn(async () => {
      networkCalls += 1;
      return new Response('{}', { status: 200 });
    }) as typeof fetch;
    try {
      assertRole('contributor', 'operator');
      throw new Error('expected PermissionDeniedError');
    } catch (err) {
      expect(err).toBeInstanceOf(PermissionDeniedError);
    }
    expect(networkCalls).toBe(0);
  });
});

describe('governance tools endpoints', () => {
  it('trapmap_list_review_queue GETs the artifact review queue', async () => {
    const calls = stubFetchCapture();
    await makeToolCaller('reviewer')('trapmap_list_review_queue', {});
    expect(calls[0]?.url).toContain('/v1/operations/artifacts/review-queue');
  });

  it('trapmap_review_decision POSTs approve/reject with note passthrough', async () => {
    const calls = stubFetchCapture();
    await makeToolCaller('operator')('trapmap_review_decision', {
      artifactId: 'a-1',
      decision: 'approve',
      note: 'lgtm',
    });
    expect(calls[0]?.url).toContain('/v1/artifacts/review');
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      artifactId: 'a-1',
      decision: 'approve',
      note: 'lgtm',
    });
  });

  it('trapmap_complete_remediation hits the entry-scoped endpoint', async () => {
    const calls = stubFetchCapture();
    await makeToolCaller('operator')('trapmap_complete_remediation', { entryId: 'e-7' });
    expect(calls[0]?.url).toContain('/v1/operations/feedback/remediation/e-7/complete');
  });

  it('trapmap_get_review_detail encodes the artifact id into history path', async () => {
    const calls = stubFetchCapture();
    await makeToolCaller('reviewer')('trapmap_get_review_detail', { artifactId: 'a/2' });
    expect(calls[0]?.url).toContain(
      `/v1/operations/artifacts/${encodeURIComponent('a/2')}/history`,
    );
  });

  it('governance tools declare reviewer/operator minimums', () => {
    expect(allTools.find((t) => t.name === 'trapmap_list_review_queue')?.requiredRole).toBe(
      'reviewer',
    );
    expect(allTools.find((t) => t.name === 'trapmap_get_review_detail')?.requiredRole).toBe(
      'reviewer',
    );
    expect(allTools.find((t) => t.name === 'trapmap_review_decision')?.requiredRole).toBe(
      'operator',
    );
    expect(allTools.find((t) => t.name === 'trapmap_complete_remediation')?.requiredRole).toBe(
      'operator',
    );
  });
});
