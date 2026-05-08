/**
 * Tests for refinement generation module.
 *
 * Covers:
 * - isRefinementAvailable() - Chat provider availability check
 * - buildRefinementPrompt() - Prompt construction from search results
 * - generateRefinement() - LLM refinement with graceful degradation
 */

import { describe, expect, it, vi } from 'vitest';

import { buildKnowledgeRefinementSystemPrompt } from '../ai/prompts.js';
import type { SkillShareerServices } from '../context.js';

import { buildRefinementPrompt, generateRefinement, isRefinementAvailable } from './refinement.js';

// ── Test helpers ──────────────────────────────────────────────────────────

function createMockServices(chatConfigured = false): SkillShareerServices {
  return {
    ai: {
      chat: {
        isConfigured: chatConfigured,
        invoke: vi.fn().mockResolvedValue('Refined summary result'),
      },
    },
  } as unknown as SkillShareerServices;
}

// =============================================================================
// Tests: isRefinementAvailable
// =============================================================================

describe('isRefinementAvailable', () => {
  it('returns true when chat is configured', () => {
    const services = createMockServices(true);
    expect(isRefinementAvailable(services)).toBe(true);
  });

  it('returns false when chat is not configured', () => {
    const services = createMockServices(false);
    expect(isRefinementAvailable(services)).toBe(false);
  });
});

// =============================================================================
// Tests: buildRefinementPrompt
// =============================================================================

describe('buildRefinementPrompt', () => {
  it('includes query and match details', () => {
    const globalConstraints = [{ shortcut: 'GC1', detail: 'Global constraint detail' }];
    const projectKnowledge = [{ shortcut: 'PK1', detail: 'Project knowledge detail' }];

    const prompt = buildRefinementPrompt('test query', globalConstraints, projectKnowledge);

    expect(prompt).toContain('test query');
    expect(prompt).toContain('GC1');
    expect(prompt).toContain('Global constraint detail');
    expect(prompt).toContain('PK1');
    expect(prompt).toContain('Project knowledge detail');
    expect(prompt).toContain('[Global Constraint]');
    expect(prompt).toContain('[Project Knowledge]');
  });
});

// =============================================================================
// Tests: generateRefinement
// =============================================================================

describe('generateRefinement', () => {
  it('returns null when refinement unavailable', async () => {
    const services = createMockServices(false);
    const result = await generateRefinement(services, 'test', [{ shortcut: 'A' }], []);
    expect(result).toBeNull();
  });

  it('returns null when no matches', async () => {
    const services = createMockServices(true);
    const result = await generateRefinement(services, 'test', [], []);
    expect(result).toBeNull();
  });

  it('returns summary string when chat is configured and matches exist', async () => {
    const services = createMockServices(true);
    const globalConstraints = [{ shortcut: 'GC1', detail: 'A constraint' }];

    const result = await generateRefinement(services, 'test query', globalConstraints, []);

    expect(result).toBe('Refined summary result');
    expect(services.ai.chat.invoke).toHaveBeenCalledWith(
      buildKnowledgeRefinementSystemPrompt({ maxSentences: 3 }),
      expect.stringContaining('test query'),
    );
  });

  it('returns null on LLM call failure (graceful degradation)', async () => {
    const services = createMockServices(true);
    vi.mocked(services.ai.chat.invoke).mockRejectedValue(new Error('LLM unavailable'));

    const globalConstraints = [{ shortcut: 'GC1', detail: 'A constraint' }];
    const result = await generateRefinement(services, 'test query', globalConstraints, []);

    expect(result).toBeNull();
  });
});
