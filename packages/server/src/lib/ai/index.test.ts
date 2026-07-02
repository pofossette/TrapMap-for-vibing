import { describe, expect, it } from 'vitest';

import {
  escapeRegExp,
  getConditionalContent,
  getDefaultConditionalRules,
  injectDynamicContent,
} from './index.js';

describe('ai barrel exports', () => {
  it('re-exports the dynamic injection helpers from the ai barrel', () => {
    expect(escapeRegExp('a+b?')).toBe('a\\+b\\?');
    expect(typeof injectDynamicContent).toBe('function');
    expect(typeof getConditionalContent).toBe('function');
    expect(Array.isArray(getDefaultConditionalRules())).toBe(true);
  });
});
