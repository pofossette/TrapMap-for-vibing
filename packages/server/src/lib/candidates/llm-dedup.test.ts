/**
 * Unit tests for the LLM duplicate judgment module.
 *
 * Tests judgeDuplicateWithLLM() with mocked ChatProvider covering:
 * - exact overlap type
 * - semantic overlap type
 * - none overlap type
 * - LLM not configured (returns null)
 * - LLM call failure (returns null after retries)
 * - Invalid response parsing (returns null)
 */

import { describe, expect, it, vi } from 'vitest';

import { createMockChat } from '@trapmap/server/testing/mock-factories.js';
import { judgeDuplicateWithLLM, parseDuplicateJudgmentResponse } from './llm-dedup.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('llm-dedup', () => {
  describe('parseDuplicateJudgmentResponse', () => {
    it('parses valid JSON response', () => {
      const raw = JSON.stringify({
        isDuplicate: true,
        confidence: 0.95,
        overlapType: 'exact',
        reasoning: 'Same content with minor rewording',
      });
      const result = parseDuplicateJudgmentResponse(raw);
      expect(result).toEqual({
        isDuplicate: true,
        confidence: 0.95,
        overlapType: 'exact',
        reasoning: 'Same content with minor rewording',
      });
    });

    it('strips markdown code fences before parsing', () => {
      const raw =
        '```json\n{"isDuplicate": false, "confidence": 0.8, "overlapType": "none", "reasoning": "Different"}\n```';
      const result = parseDuplicateJudgmentResponse(raw);
      expect(result).not.toBeNull();
      expect(result?.isDuplicate).toBe(false);
    });

    it('returns null for invalid JSON', () => {
      expect(parseDuplicateJudgmentResponse('not json')).toBeNull();
    });

    it('returns null for missing required fields', () => {
      expect(parseDuplicateJudgmentResponse(JSON.stringify({ isDuplicate: true }))).toBeNull();
    });

    it('returns null for invalid overlapType', () => {
      expect(
        parseDuplicateJudgmentResponse(
          JSON.stringify({
            isDuplicate: true,
            confidence: 0.9,
            overlapType: 'invalid',
            reasoning: 'test',
          }),
        ),
      ).toBeNull();
    });

    it('returns null for confidence out of range', () => {
      expect(
        parseDuplicateJudgmentResponse(
          JSON.stringify({
            isDuplicate: true,
            confidence: 1.5,
            overlapType: 'exact',
            reasoning: 'test',
          }),
        ),
      ).toBeNull();
    });
  });

  describe('judgeDuplicateWithLLM', () => {
    const candidate = { title: 'Docker timeout fix', body: 'Set HEALTHCHECK interval to 30s' };
    const existing = { title: 'Docker health check', body: 'Configure health check interval' };

    it('returns exact judgment when LLM classifies as exact duplicate', async () => {
      const chat = createMockChat({
        invoke: vi.fn().mockResolvedValue(
          JSON.stringify({
            isDuplicate: true,
            confidence: 0.95,
            overlapType: 'exact',
            reasoning: 'Both describe the same Docker healthcheck configuration',
          }),
        ),
      });

      const result = await judgeDuplicateWithLLM(chat, candidate, existing);

      expect(result).not.toBeNull();
      expect(result?.isDuplicate).toBe(true);
      expect(result?.overlapType).toBe('exact');
      expect(result?.confidence).toBe(0.95);
      expect(chat.invoke).toHaveBeenCalledOnce();
    });

    it('returns semantic judgment when LLM classifies as semantic overlap', async () => {
      const chat = createMockChat({
        invoke: vi.fn().mockResolvedValue(
          JSON.stringify({
            isDuplicate: true,
            confidence: 0.75,
            overlapType: 'semantic',
            reasoning: 'Both address Docker timeout issues but with different approaches',
          }),
        ),
      });

      const result = await judgeDuplicateWithLLM(chat, candidate, existing);

      expect(result).not.toBeNull();
      expect(result?.isDuplicate).toBe(true);
      expect(result?.overlapType).toBe('semantic');
      expect(result?.confidence).toBe(0.75);
    });

    it('returns none judgment when LLM classifies as not duplicate', async () => {
      const chat = createMockChat({
        invoke: vi.fn().mockResolvedValue(
          JSON.stringify({
            isDuplicate: false,
            confidence: 0.85,
            overlapType: 'none',
            reasoning: 'One is about Docker, the other about Kubernetes networking',
          }),
        ),
      });

      const differentCandidate = {
        title: 'K8s networking',
        body: 'Configure pod network policies',
      };
      const result = await judgeDuplicateWithLLM(chat, differentCandidate, existing);

      expect(result).not.toBeNull();
      expect(result?.isDuplicate).toBe(false);
      expect(result?.overlapType).toBe('none');
    });

    it('returns null when chat is not configured', async () => {
      const chat = createMockChat({ isConfigured: false });

      const result = await judgeDuplicateWithLLM(chat, candidate, existing);

      expect(result).toBeNull();
      expect(chat.invoke).not.toHaveBeenCalled();
    });

    it('returns null when LLM call fails after retries', async () => {
      const chat = createMockChat({
        invoke: vi.fn().mockRejectedValue(new Error('API error')),
      });

      const result = await judgeDuplicateWithLLM(chat, candidate, existing);

      expect(result).toBeNull();
      // Should have been called 3 times (initial + 2 retries)
      expect(chat.invoke).toHaveBeenCalledTimes(3);
    });

    it('returns null when LLM returns unparseable response', async () => {
      const chat = createMockChat({
        invoke: vi.fn().mockResolvedValue('I cannot determine this'),
      });

      const result = await judgeDuplicateWithLLM(chat, candidate, existing);

      // parseDuplicateJudgmentResponse returns null for invalid JSON,
      // but judgeDuplicateWithLLM returns whatever parseDuplicateJudgmentResponse returns
      // (it doesn't retry on parse failure, only on invoke exceptions)
      expect(result).toBeNull();
    });
  });
});
