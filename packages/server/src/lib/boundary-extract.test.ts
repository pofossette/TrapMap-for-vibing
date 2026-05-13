import { describe, expect, it, vi } from 'vitest';

import type { Boundary } from '@trapmap/contracts';

import type { PromptBlock } from './ai/cache/api-integration.js';
import { buildBoundaryExtractionSystemPrompt } from './ai/prompts.js';
import type { ChatProvider } from './ai/types.js';
import { extractCandidateBoundaries } from './boundary-extract.js';

/**
 * Mock chat provider that returns a configured response.
 */
function mockChat(response: string | null, configured = true): ChatProvider {
  return {
    provider: 'mock',
    isConfigured: configured,
    invoke: vi.fn().mockImplementation(async () => {
      if (response === null) {
        throw new Error('LLM invocation failed');
      }
      return response;
    }),
  };
}

describe('extractCandidateBoundaries', () => {
  it('returns null when chat provider not configured', async () => {
    const chat = mockChat('{}', false);
    const result = await extractCandidateBoundaries(chat, {
      shortcut: 'Test',
      detail: 'Test detail',
      labels: ['test'],
    });

    expect(result).toBeNull();
  });

  it('returns null on LLM invocation failure', async () => {
    const chat = mockChat(null, true);
    const result = await extractCandidateBoundaries(chat, {
      shortcut: 'Test',
      detail: 'Test detail',
      labels: ['test'],
    });

    expect(result).toBeNull();
  });

  it('returns null on invalid JSON response', async () => {
    const chat = mockChat('not valid json', true);
    const result = await extractCandidateBoundaries(chat, {
      shortcut: 'Test',
      detail: 'Test detail',
      labels: ['test'],
    });

    expect(result).toBeNull();
  });

  it('returns null on schema validation failure', async () => {
    // context must be array of strings, not numbers
    const chat = mockChat('{"context": [123, 456]}', true);
    const result = await extractCandidateBoundaries(chat, {
      shortcut: 'Test',
      detail: 'Test detail',
      labels: ['test'],
    });

    expect(result).toBeNull();
  });

  it('returns parsed boundary on valid response', async () => {
    const validBoundary: Boundary = {
      context: ['frontend', 'production'],
      versions: [{ package: 'react', range: '>=16.8.0' }],
      prerequisites: [],
      signals: [],
      exclusions: [],
      evidence: [],
    };
    const chat = mockChat(JSON.stringify(validBoundary), true);
    const result = await extractCandidateBoundaries(chat, {
      shortcut: 'Test',
      detail: 'Test detail',
      labels: ['test'],
    });

    expect(result).not.toBeNull();
    expect(result?.context).toEqual(['frontend', 'production']);
    expect(result?.versions).toHaveLength(1);
    expect(result?.versions[0]?.package).toBe('react');
  });

  it('passes shortcut, detail, labels to LLM', async () => {
    const invokeSpy = vi.fn().mockResolvedValue('{}');
    const chat: ChatProvider = {
      provider: 'mock',
      isConfigured: true,
      invoke: invokeSpy,
    };

    await extractCandidateBoundaries(chat, {
      shortcut: 'React hooks pitfall',
      detail: 'Do not call hooks inside loops',
      labels: ['react', 'hooks'],
    });

    expect(invokeSpy).toHaveBeenCalledTimes(1);
    const [systemPrompt, userMessage] = invokeSpy.mock.calls[0] ?? ['', ''];

    expect(systemPrompt).toBe(buildBoundaryExtractionSystemPrompt());
    expect(userMessage).toContain('React hooks pitfall');
    expect(userMessage).toContain('Do not call hooks inside loops');
    expect(userMessage).toContain('react, hooks');
  });

  it('returns boundary with defaults for empty JSON object', async () => {
    const chat = mockChat('{}', true);
    const result = await extractCandidateBoundaries(chat, {
      shortcut: 'Test',
      detail: 'Test detail',
      labels: ['test'],
    });

    expect(result).not.toBeNull();
    expect(result?.context).toEqual([]);
    expect(result?.versions).toEqual([]);
    expect(result?.prerequisites).toEqual([]);
    expect(result?.signals).toEqual([]);
    expect(result?.exclusions).toEqual([]);
    expect(result?.evidence).toEqual([]);
  });

  it('uses invokeWithBlocks when available on chat provider', async () => {
    const invokeWithBlocksSpy = vi.fn().mockResolvedValue('{}');
    const invokeSpy = vi.fn().mockResolvedValue('{}');
    const chat: ChatProvider = {
      provider: 'mock',
      isConfigured: true,
      invoke: invokeSpy,
      invokeWithBlocks: invokeWithBlocksSpy,
    };

    await extractCandidateBoundaries(chat, {
      shortcut: 'Test',
      detail: 'Test detail',
      labels: ['test'],
    });

    expect(invokeWithBlocksSpy).toHaveBeenCalledTimes(1);
    expect(invokeSpy).not.toHaveBeenCalled();

    const [blocks, userMessage] = invokeWithBlocksSpy.mock.calls[0] as [PromptBlock[], string];
    expect(Array.isArray(blocks)).toBe(true);
    expect(blocks.length).toBeGreaterThan(0);
    expect(userMessage).toContain('Test');
  });

  it('falls back to invoke when invokeWithBlocks is not available', async () => {
    const invokeSpy = vi.fn().mockResolvedValue('{}');
    const chat: ChatProvider = {
      provider: 'mock',
      isConfigured: true,
      invoke: invokeSpy,
    };

    await extractCandidateBoundaries(chat, {
      shortcut: 'Test',
      detail: 'Test detail',
      labels: ['test'],
    });

    expect(invokeSpy).toHaveBeenCalledTimes(1);
    const [systemPrompt] = invokeSpy.mock.calls[0] ?? [''];
    expect(systemPrompt).toBe(buildBoundaryExtractionSystemPrompt());
  });
});
