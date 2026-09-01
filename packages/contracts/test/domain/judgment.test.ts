import { describe, expect, it } from 'vitest';

import {
  channelMergeConfigSchema,
  conflictTriggerConfigSchema,
  dedupStrategyConfigSchema,
  intentRecognitionConfigSchema,
  judgmentModeSchema,
  labelAlignmentConfigSchema,
} from '../../src/domain/judgment.js';

describe('judgment node config schemas (D8)', () => {
  it('judgmentModeSchema accepts the three implementation modes', () => {
    expect(judgmentModeSchema.parse('rule')).toBe('rule');
    expect(judgmentModeSchema.parse('llm')).toBe('llm');
    expect(judgmentModeSchema.parse('hybrid')).toBe('hybrid');
    expect(() => judgmentModeSchema.parse('magic')).toThrow();
  });

  it('every node config defaults to rule mode (behavior-preserving default)', () => {
    expect(intentRecognitionConfigSchema.parse({}).mode).toBe('rule');
    expect(dedupStrategyConfigSchema.parse({}).mode).toBe('rule');
    expect(conflictTriggerConfigSchema.parse({}).mode).toBe('rule');
    expect(channelMergeConfigSchema.parse({}).mode).toBe('rule');
    // artifact schema shares the same shape (covered via judgmentConfigSchemas below)
  });

  it('explicit modes parse and invalid modes fail loudly', () => {
    expect(intentRecognitionConfigSchema.parse({ mode: 'hybrid' }).mode).toBe('hybrid');
    expect(dedupStrategyConfigSchema.parse({ mode: 'llm' }).mode).toBe('llm');
    expect(() => intentRecognitionConfigSchema.parse({ mode: 'bogus' })).toThrow();
  });

  it('label-alignment config carries the pre-contract align options', () => {
    const parsed = labelAlignmentConfigSchema.parse({
      mode: 'llm',
      maxCandidates: 5,
      autoMergeThreshold: 0.6,
    });
    expect(parsed.maxCandidates).toBe(5);
    expect(parsed.autoMergeThreshold).toBe(0.6);
    expect(() => labelAlignmentConfigSchema.parse({ maxCandidates: 0 })).toThrow();
    expect(() => labelAlignmentConfigSchema.parse({ autoMergeThreshold: 1.5 })).toThrow();
  });

  it('judgmentConfigSchemas registers all six node ids', async () => {
    const { judgmentConfigSchemas } = await import('../../src/domain/judgment.js');
    expect(Object.keys(judgmentConfigSchemas).sort()).toEqual([
      'artifact-derivation',
      'channel-merge',
      'conflict-trigger',
      'dedup-strategy',
      'intent-recognition',
      'label-alignment',
    ]);
  });
});
