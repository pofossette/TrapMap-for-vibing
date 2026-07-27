import { describe, expect, it, vi } from 'vitest';

import type { Boundary } from '@trapmap/contracts';

import type { PromptBlock } from './ai/cache/api-integration.js';
import { buildBoundaryExtractionSystemPrompt } from './ai/prompts.js';
import type { ChatProvider } from '@trapmap/ai-providers';
import {
  buildBoundaryWithQualitySystemPrompt,
  extractCandidateBoundaries,
  extractCandidateBoundariesWithQuality,
  parseBoundaryWithQualityResponse,
} from './boundary-extract.js';

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

// ---------------------------------------------------------------------------
// Phase 3: extractCandidateBoundariesWithQuality tests
// ---------------------------------------------------------------------------

describe('parseBoundaryWithQualityResponse', () => {
  it('parses a valid combined response', () => {
    const response = JSON.stringify({
      context: ['frontend'],
      versions: [{ package: 'react', range: '>=16.8.0' }],
      prerequisites: [],
      signals: [],
      exclusions: [],
      evidence: [{ kind: 'issue', identifier: '123' }],
      correctness: {
        evidenceQuality: 'strong',
        reasoning: 'Has a specific issue reference and reproduction steps.',
      },
      completeness: {
        isComplete: true,
        missingAspects: [],
      },
    });

    const result = parseBoundaryWithQualityResponse(response);
    expect(result).not.toBeNull();
    expect(result?.boundary.context).toEqual(['frontend']);
    expect(result?.boundary.evidence).toHaveLength(1);
    expect(result?.correctness.evidenceQuality).toBe('strong');
    expect(result?.completeness.isComplete).toBe(true);
  });

  it('strips markdown code fences before parsing', () => {
    const response = `\`\`\`json\n${JSON.stringify({
      context: [],
      versions: [],
      prerequisites: [],
      signals: [],
      exclusions: [],
      evidence: [],
      correctness: { evidenceQuality: 'none', reasoning: 'No evidence provided.' },
      completeness: { isComplete: false, missingAspects: ['root cause'] },
    })}\n\`\`\``;

    const result = parseBoundaryWithQualityResponse(response);
    expect(result).not.toBeNull();
    expect(result?.correctness.evidenceQuality).toBe('none');
    expect(result?.completeness.missingAspects).toEqual(['root cause']);
  });

  it('returns null for invalid JSON', () => {
    expect(parseBoundaryWithQualityResponse('not json')).toBeNull();
  });

  it('returns null when evidenceQuality is invalid', () => {
    const response = JSON.stringify({
      context: [],
      versions: [],
      prerequisites: [],
      signals: [],
      exclusions: [],
      evidence: [],
      correctness: { evidenceQuality: 'invalid', reasoning: 'test' },
      completeness: { isComplete: true, missingAspects: [] },
    });

    expect(parseBoundaryWithQualityResponse(response)).toBeNull();
  });

  it('returns null when correctness field is missing', () => {
    const response = JSON.stringify({
      context: [],
      versions: [],
      prerequisites: [],
      signals: [],
      exclusions: [],
      evidence: [],
      completeness: { isComplete: true, missingAspects: [] },
    });

    expect(parseBoundaryWithQualityResponse(response)).toBeNull();
  });

  it('returns null when completeness field is missing', () => {
    const response = JSON.stringify({
      context: [],
      versions: [],
      prerequisites: [],
      signals: [],
      exclusions: [],
      evidence: [],
      correctness: { evidenceQuality: 'strong', reasoning: 'test' },
    });

    expect(parseBoundaryWithQualityResponse(response)).toBeNull();
  });

  it('defaults boundary fields to empty arrays', () => {
    const response = JSON.stringify({
      correctness: { evidenceQuality: 'moderate', reasoning: 'Some indirect evidence.' },
      completeness: { isComplete: true, missingAspects: [] },
    });

    const result = parseBoundaryWithQualityResponse(response);
    expect(result).not.toBeNull();
    expect(result?.boundary.context).toEqual([]);
    expect(result?.boundary.versions).toEqual([]);
    expect(result?.boundary.prerequisites).toEqual([]);
    expect(result?.boundary.signals).toEqual([]);
    expect(result?.boundary.exclusions).toEqual([]);
    expect(result?.boundary.evidence).toEqual([]);
  });
});

describe('buildBoundaryWithQualitySystemPrompt', () => {
  it('includes correctness assessment instructions', () => {
    const prompt = buildBoundaryWithQualitySystemPrompt();
    expect(prompt).toContain('evidenceQuality');
    expect(prompt).toContain('strong');
    expect(prompt).toContain('moderate');
    expect(prompt).toContain('weak');
    expect(prompt).toContain('none');
  });

  it('includes completeness assessment instructions', () => {
    const prompt = buildBoundaryWithQualitySystemPrompt();
    expect(prompt).toContain('isComplete');
    expect(prompt).toContain('missingAspects');
  });

  it('includes boundary extraction instructions', () => {
    const prompt = buildBoundaryWithQualitySystemPrompt();
    expect(prompt).toContain('context');
    expect(prompt).toContain('versions');
    expect(prompt).toContain('prerequisites');
    expect(prompt).toContain('signals');
    expect(prompt).toContain('exclusions');
    expect(prompt).toContain('evidence');
  });

  it('includes output JSON structure', () => {
    const prompt = buildBoundaryWithQualitySystemPrompt();
    expect(prompt).toContain('"correctness"');
    expect(prompt).toContain('"completeness"');
  });
});

describe('extractCandidateBoundariesWithQuality', () => {
  it('returns null when chat provider not configured', async () => {
    const chat = mockChat('{}', false);
    const result = await extractCandidateBoundariesWithQuality(chat, {
      shortcut: 'Test',
      detail: 'Test detail',
      labels: ['test'],
    });
    expect(result).toBeNull();
  });

  it('returns null on LLM invocation failure after retries', async () => {
    const chat = mockChat(null, true);
    const result = await extractCandidateBoundariesWithQuality(chat, {
      shortcut: 'Test',
      detail: 'Test detail',
      labels: ['test'],
    });
    expect(result).toBeNull();
  });

  it('returns null on invalid JSON response after retries', async () => {
    const chat = mockChat('not valid json', true);
    const result = await extractCandidateBoundariesWithQuality(chat, {
      shortcut: 'Test',
      detail: 'Test detail',
      labels: ['test'],
    });
    expect(result).toBeNull();
  });

  it('returns parsed boundary with quality on valid response', async () => {
    const chat = mockChat(
      JSON.stringify({
        context: ['frontend'],
        versions: [],
        prerequisites: [],
        signals: [],
        exclusions: [],
        evidence: [],
        correctness: { evidenceQuality: 'strong', reasoning: 'Has specific issue reference.' },
        completeness: { isComplete: true, missingAspects: [] },
      }),
      true,
    );

    const result = await extractCandidateBoundariesWithQuality(chat, {
      shortcut: 'Test',
      detail: 'Test detail',
      labels: ['test'],
    });

    expect(result).not.toBeNull();
    expect(result?.boundary.context).toEqual(['frontend']);
    expect(result?.correctness.evidenceQuality).toBe('strong');
    expect(result?.completeness.isComplete).toBe(true);
  });

  it('passes shortcut, detail, labels to LLM', async () => {
    const invokeSpy = vi.fn().mockResolvedValue(
      JSON.stringify({
        correctness: { evidenceQuality: 'moderate', reasoning: 'test' },
        completeness: { isComplete: false, missingAspects: ['reproduction steps'] },
      }),
    );
    const chat: ChatProvider = {
      provider: 'mock',
      isConfigured: true,
      invoke: invokeSpy,
    };

    await extractCandidateBoundariesWithQuality(chat, {
      shortcut: 'Docker timeout',
      detail: 'Container health check issue',
      labels: ['docker', 'k8s'],
    });

    expect(invokeSpy).toHaveBeenCalledTimes(1);
    const [systemPrompt, userMessage] = invokeSpy.mock.calls[0] ?? ['', ''];
    expect(systemPrompt).toBe(buildBoundaryWithQualitySystemPrompt());
    expect(userMessage).toContain('Docker timeout');
    expect(userMessage).toContain('Container health check issue');
    expect(userMessage).toContain('docker, k8s');
  });

  it('uses invoke (not invokeWithBlocks) for quality-aware extraction', async () => {
    const invokeWithBlocksSpy = vi.fn().mockResolvedValue(
      JSON.stringify({
        correctness: { evidenceQuality: 'moderate', reasoning: 'test' },
        completeness: { isComplete: true, missingAspects: [] },
      }),
    );
    const invokeSpy = vi.fn().mockResolvedValue(
      JSON.stringify({
        correctness: { evidenceQuality: 'moderate', reasoning: 'test' },
        completeness: { isComplete: true, missingAspects: [] },
      }),
    );
    const chat: ChatProvider = {
      provider: 'mock',
      isConfigured: true,
      invoke: invokeSpy,
      invokeWithBlocks: invokeWithBlocksSpy,
    };

    await extractCandidateBoundariesWithQuality(chat, {
      shortcut: 'Test',
      detail: 'Test detail',
      labels: ['test'],
    });

    expect(invokeSpy).toHaveBeenCalledTimes(1);
    expect(invokeWithBlocksSpy).not.toHaveBeenCalled();
  });

  it('handles response with code fences', async () => {
    const response = `\`\`\`json\n${JSON.stringify({
      context: ['production'],
      versions: [],
      prerequisites: [],
      signals: [],
      exclusions: [],
      evidence: [],
      correctness: { evidenceQuality: 'weak', reasoning: 'Vague claims.' },
      completeness: { isComplete: false, missingAspects: ['root cause'] },
    })}\n\`\`\``;

    const chat = mockChat(response, true);
    const result = await extractCandidateBoundariesWithQuality(chat, {
      shortcut: 'Test',
      detail: 'Test detail',
      labels: ['test'],
    });

    expect(result).not.toBeNull();
    expect(result?.boundary.context).toEqual(['production']);
    expect(result?.correctness.evidenceQuality).toBe('weak');
    expect(result?.completeness.missingAspects).toEqual(['root cause']);
  });

  it('returns null on schema validation failure (missing completeness)', async () => {
    const chat = mockChat(
      JSON.stringify({
        context: [],
        versions: [],
        prerequisites: [],
        signals: [],
        exclusions: [],
        evidence: [],
        correctness: { evidenceQuality: 'strong', reasoning: 'test' },
        // missing completeness
      }),
      true,
    );

    const result = await extractCandidateBoundariesWithQuality(chat, {
      shortcut: 'Test',
      detail: 'Test detail',
      labels: ['test'],
    });

    expect(result).toBeNull();
  });
});
