/**
 * Tests for OpenAI judge provider error paths.
 *
 * Covers: non-200 responses, empty content, missing choices, invalid JSON,
 * missing verifications array, fetch exceptions, empty claims, no API key,
 * and checkForbidden always using fallback.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLlmJudgeProvider, createOpenAiJudgeProvider } from '../lib/judge.js';

// Helper to create a mock Response
function mockResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function _mockTextResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain' },
  });
}

const sampleClaims = [{ text: 'Docker is a container tool' }];
const sampleContext = ['Docker is a container tool for running applications'];

describe('OpenAI judge error paths', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // ------------------------------------------------------------------
  // verifyClaims error paths
  // ------------------------------------------------------------------

  it('falls back to rules-based on non-200 response', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockResponse({ error: 'rate limited' }, 429));

    const provider = createOpenAiJudgeProvider({ apiKey: 'test-key' });
    const result = await provider.verifyClaims({ claims: sampleClaims, context: sampleContext });

    expect(result).toHaveLength(1);
    // Fallback should still return a valid result
    expect(result[0]).toHaveProperty('supported');
  });

  it('falls back when response has empty content', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockResponse({
        choices: [{ message: { content: '' } }],
      }),
    );

    const provider = createOpenAiJudgeProvider({ apiKey: 'test-key' });
    const result = await provider.verifyClaims({ claims: sampleClaims, context: sampleContext });

    expect(result).toHaveLength(1);
    expect(result[0]).toHaveProperty('supported');
  });

  it('falls back when response has no choices', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockResponse({ choices: [] }));

    const provider = createOpenAiJudgeProvider({ apiKey: 'test-key' });
    const result = await provider.verifyClaims({ claims: sampleClaims, context: sampleContext });

    expect(result).toHaveLength(1);
    expect(result[0]).toHaveProperty('supported');
  });

  it('falls back when response content is not valid JSON', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockResponse({
        choices: [{ message: { content: 'not json at all' } }],
      }),
    );

    const provider = createOpenAiJudgeProvider({ apiKey: 'test-key' });
    const result = await provider.verifyClaims({ claims: sampleClaims, context: sampleContext });

    expect(result).toHaveLength(1);
    expect(result[0]).toHaveProperty('supported');
  });

  it('falls back when parsed JSON has no verifications array', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockResponse({
        choices: [{ message: { content: JSON.stringify({ results: 'something' }) } }],
      }),
    );

    const provider = createOpenAiJudgeProvider({ apiKey: 'test-key' });
    const result = await provider.verifyClaims({ claims: sampleClaims, context: sampleContext });

    expect(result).toHaveLength(1);
    expect(result[0]).toHaveProperty('supported');
  });

  it('falls back on fetch network exception', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const provider = createOpenAiJudgeProvider({ apiKey: 'test-key' });
    const result = await provider.verifyClaims({ claims: sampleClaims, context: sampleContext });

    expect(result).toHaveLength(1);
    expect(result[0]).toHaveProperty('supported');
  });

  it('returns empty array for empty claims input', async () => {
    const provider = createOpenAiJudgeProvider({ apiKey: 'test-key' });
    const result = await provider.verifyClaims({ claims: [], context: sampleContext });

    expect(result).toHaveLength(0);
  });

  it('falls back when no API key is provided', async () => {
    global.fetch = vi.fn(); // should not be called

    const provider = createOpenAiJudgeProvider({});
    const result = await provider.verifyClaims({ claims: sampleClaims, context: sampleContext });

    expect(result).toHaveLength(1);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('falls back when choices[0].message is undefined', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockResponse({
        choices: [{}],
      }),
    );

    const provider = createOpenAiJudgeProvider({ apiKey: 'test-key' });
    const result = await provider.verifyClaims({ claims: sampleClaims, context: sampleContext });

    expect(result).toHaveLength(1);
    expect(result[0]).toHaveProperty('supported');
  });

  // ------------------------------------------------------------------
  // checkForbidden always uses fallback
  // ------------------------------------------------------------------

  it('checkForbidden always uses fallback (deterministic)', async () => {
    global.fetch = vi.fn(); // should never be called

    const provider = createOpenAiJudgeProvider({ apiKey: 'test-key' });
    const result = await provider.checkForbidden({
      summaryText: 'The password is secret123',
      forbiddenClaims: ['password', 'token'],
    });

    expect(result).toContain('password');
    expect(result).not.toContain('token');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  // ------------------------------------------------------------------
  // createLlmJudgeProvider routing
  // ------------------------------------------------------------------

  it('createLlmJudgeProvider with openai provider creates openai judge', () => {
    const provider = createLlmJudgeProvider({ provider: 'openai', apiKey: 'test-key' });
    expect(provider.name).toBe('openai');
  });

  it('createLlmJudgeProvider with fallback provider creates fallback judge', () => {
    const provider = createLlmJudgeProvider({ provider: 'fallback' });
    expect(provider.name).toBe('fallback');
  });
});
