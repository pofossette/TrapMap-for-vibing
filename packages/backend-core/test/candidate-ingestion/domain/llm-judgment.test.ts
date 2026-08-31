import { describe, expect, it } from 'vitest';

import {
  LLM_DUPLICATE_CONFIDENCE_MAX,
  LLM_DUPLICATE_CONFIDENCE_MIN,
  LLM_DUPLICATE_OVERLAP_TYPES,
  LLM_DUPLICATE_REASONING_MAX,
  LLM_DUPLICATE_REASONING_MIN,
} from '../../../src/candidate-ingestion/domain/llm-judgment.js';

describe('candidate-ingestion LLM dedup judgment rules', () => {
  it('locks the overlap taxonomy and reasoning bounds', () => {
    expect(LLM_DUPLICATE_OVERLAP_TYPES).toEqual(['exact', 'semantic', 'none']);
    expect(LLM_DUPLICATE_CONFIDENCE_MIN).toBe(0);
    expect(LLM_DUPLICATE_CONFIDENCE_MAX).toBe(1);
    expect(LLM_DUPLICATE_REASONING_MIN).toBe(1);
    expect(LLM_DUPLICATE_REASONING_MAX).toBe(1024);
  });
});
