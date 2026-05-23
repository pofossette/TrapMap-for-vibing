/**
 * Unit tests for the LLM conflict judgment module.
 *
 * Tests judgeConflictWithLLM() with mocked ChatProvider covering:
 * - contradictory conflict type
 * - alternative conflict type
 * - superseded conflict type
 * - none (no conflict) type
 * - LLM not configured (returns null)
 * - LLM call failure (returns null after retries)
 * - Invalid response parsing (returns null)
 */

import { describe, expect, it, vi } from 'vitest';

import type { ChatProvider } from '@trapmap/server/lib/ai/types.js';
import { judgeConflictWithLLM, parseConflictJudgmentResponse } from './llm-conflict.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockChat(overrides: Partial<ChatProvider> = {}): ChatProvider {
  return {
    provider: 'mock',
    isConfigured: true,
    invoke: vi.fn().mockResolvedValue(
      JSON.stringify({
        conflictType: 'none',
        confidence: 0.9,
        reasoning: 'Different topics',
      }),
    ),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('llm-conflict', () => {
  describe('parseConflictJudgmentResponse', () => {
    it('parses valid JSON response', () => {
      const raw = JSON.stringify({
        conflictType: 'contradictory',
        confidence: 0.92,
        reasoning: 'One says use X, the other says avoid X',
        resolution: 'Investigate which is correct for the context',
      });
      const result = parseConflictJudgmentResponse(raw);
      expect(result).toEqual({
        conflictType: 'contradictory',
        confidence: 0.92,
        reasoning: 'One says use X, the other says avoid X',
        resolution: 'Investigate which is correct for the context',
      });
    });

    it('parses response without optional resolution', () => {
      const raw = JSON.stringify({
        conflictType: 'alternative',
        confidence: 0.8,
        reasoning: 'Both valid approaches',
      });
      const result = parseConflictJudgmentResponse(raw);
      expect(result).not.toBeNull();
      expect(result?.conflictType).toBe('alternative');
      expect(result?.resolution).toBeUndefined();
    });

    it('strips markdown code fences before parsing', () => {
      const raw =
        '```json\n{"conflictType": "none", "confidence": 0.7, "reasoning": "No conflict"}\n```';
      const result = parseConflictJudgmentResponse(raw);
      expect(result).not.toBeNull();
      expect(result?.conflictType).toBe('none');
    });

    it('returns null for invalid JSON', () => {
      expect(parseConflictJudgmentResponse('not json')).toBeNull();
    });

    it('returns null for missing required fields', () => {
      expect(parseConflictJudgmentResponse(JSON.stringify({ conflictType: 'none' }))).toBeNull();
    });

    it('returns null for invalid conflictType', () => {
      expect(
        parseConflictJudgmentResponse(
          JSON.stringify({
            conflictType: 'invalid',
            confidence: 0.9,
            reasoning: 'test',
          }),
        ),
      ).toBeNull();
    });

    it('returns null for confidence out of range', () => {
      expect(
        parseConflictJudgmentResponse(
          JSON.stringify({
            conflictType: 'none',
            confidence: 1.5,
            reasoning: 'test',
          }),
        ),
      ).toBeNull();
    });
  });

  describe('judgeConflictWithLLM', () => {
    const entryA = { title: 'Use strict mode', body: 'Always enable strict TypeScript mode' };
    const entryB = {
      title: 'Avoid strict mode',
      body: 'Strict mode causes too many build errors, disable it',
    };

    it('returns contradictory judgment when LLM classifies as contradictory', async () => {
      const chat = createMockChat({
        invoke: vi.fn().mockResolvedValue(
          JSON.stringify({
            conflictType: 'contradictory',
            confidence: 0.95,
            reasoning: 'One says enable strict mode, the other says disable it',
            resolution:
              'Context-dependent: enable for new projects, allow gradual migration for legacy',
          }),
        ),
      });

      const result = await judgeConflictWithLLM(chat, entryA, entryB);

      expect(result).not.toBeNull();
      expect(result?.conflictType).toBe('contradictory');
      expect(result?.confidence).toBe(0.95);
      expect(result?.resolution).toBeDefined();
      expect(chat.invoke).toHaveBeenCalledOnce();
    });

    it('returns alternative judgment when LLM classifies as alternative', async () => {
      const chat = createMockChat({
        invoke: vi.fn().mockResolvedValue(
          JSON.stringify({
            conflictType: 'alternative',
            confidence: 0.8,
            reasoning: 'Both REST and GraphQL are valid API approaches',
          }),
        ),
      });

      const restEntry = { title: 'Use REST APIs', body: 'REST is simpler and well-understood' };
      const graphqlEntry = { title: 'Use GraphQL', body: 'GraphQL gives clients flexibility' };

      const result = await judgeConflictWithLLM(chat, restEntry, graphqlEntry);

      expect(result).not.toBeNull();
      expect(result?.conflictType).toBe('alternative');
      expect(result?.confidence).toBe(0.8);
    });

    it('returns superseded judgment when LLM classifies as superseded', async () => {
      const chat = createMockChat({
        invoke: vi.fn().mockResolvedValue(
          JSON.stringify({
            conflictType: 'superseded',
            confidence: 0.85,
            reasoning: 'The newer entry explicitly replaces the older approach',
            resolution: 'Archive the older entry and link to the newer one',
          }),
        ),
      });

      const oldEntry = { title: 'Use Mocha', body: 'Use Mocha for testing' };
      const newEntry = {
        title: 'Use Vitest',
        body: 'Vitest is faster and has better ESM support, replaces Mocha',
      };

      const result = await judgeConflictWithLLM(chat, oldEntry, newEntry);

      expect(result).not.toBeNull();
      expect(result?.conflictType).toBe('superseded');
      expect(result?.resolution).toBeDefined();
    });

    it('returns none judgment when entries do not conflict', async () => {
      const chat = createMockChat({
        invoke: vi.fn().mockResolvedValue(
          JSON.stringify({
            conflictType: 'none',
            confidence: 0.9,
            reasoning: 'One is about testing, the other about deployment',
          }),
        ),
      });

      const testingEntry = { title: 'Use Vitest', body: 'Fast testing framework' };
      const deployEntry = { title: 'Use Docker', body: 'Containerize your app for deployment' };

      const result = await judgeConflictWithLLM(chat, testingEntry, deployEntry);

      expect(result).not.toBeNull();
      expect(result?.conflictType).toBe('none');
    });

    it('returns null when chat is not configured', async () => {
      const chat = createMockChat({ isConfigured: false });

      const result = await judgeConflictWithLLM(chat, entryA, entryB);

      expect(result).toBeNull();
      expect(chat.invoke).not.toHaveBeenCalled();
    });

    it('returns null when LLM call fails after retries', async () => {
      const chat = createMockChat({
        invoke: vi.fn().mockRejectedValue(new Error('API error')),
      });

      const result = await judgeConflictWithLLM(chat, entryA, entryB);

      expect(result).toBeNull();
      // Should have been called 3 times (initial + 2 retries)
      expect(chat.invoke).toHaveBeenCalledTimes(3);
    });

    it('returns null when LLM returns unparseable response', async () => {
      const chat = createMockChat({
        invoke: vi.fn().mockResolvedValue('I cannot determine this'),
      });

      const result = await judgeConflictWithLLM(chat, entryA, entryB);

      expect(result).toBeNull();
    });
  });
});
