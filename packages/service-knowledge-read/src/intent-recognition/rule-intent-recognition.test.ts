import { assertIntentResultShape, intentSampleInput } from '@trapmap/backend-core';
import { describe, expect, it } from 'vitest';

import { createRuleIntentRecognition } from './rule-intent-recognition.js';

describe('createRuleIntentRecognition', () => {
  it('honors an explicitly requested known mode', async () => {
    const rule = createRuleIntentRecognition();
    const result = await rule.recognize(intentSampleInput);

    expect(result.mode).toBe('hybrid');
    expect(result.reason).toBe('explicit-requested-mode');
    expect(result.trace?.routeFamily).toBe('hybrid');
    assertIntentResultShape(result);
  });

  it('falls back to the default mode when no mode is requested', async () => {
    const rule = createRuleIntentRecognition();
    const result = await rule.recognize({
      ...intentSampleInput,
      requestedMode: undefined,
    });

    expect(result.mode).toBe('semantic');
    expect(result.reason).toBe('fallback-default');
    expect(result.trace?.routeFamily).toBe('semantic');
    assertIntentResultShape(result);
  });

  it('rejects an explicitly requested mode the engine cannot execute', async () => {
    const rule = createRuleIntentRecognition();
    // 'hybrid' is a valid contract mode but absent from knownModes → the
    // rule implementation must reject it (mirrors dispatchByMode).
    const input = {
      ...intentSampleInput,
      requestedMode: 'hybrid' as const,
      knownModes: ['semantic'],
    };

    await expect(rule.recognize(input)).rejects.toThrow();
  });
});
