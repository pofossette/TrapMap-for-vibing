import { afterEach, describe, expect, it } from 'vitest';

import { isInteractiveEnvironment } from './prompts.js';

describe('isInteractiveEnvironment', () => {
  const originalStdin = process.stdin;
  const originalStdout = process.stdout;

  afterEach(() => {
    Object.defineProperty(process, 'stdin', { value: originalStdin, configurable: true });
    Object.defineProperty(process, 'stdout', { value: originalStdout, configurable: true });
  });

  it('does not crash when process.stdin is undefined', () => {
    Object.defineProperty(process, 'stdin', { value: undefined, configurable: true });
    expect(() => isInteractiveEnvironment()).not.toThrow();
    expect(isInteractiveEnvironment()).toBe(false);
  });

  it('does not crash when process.stdout is undefined', () => {
    Object.defineProperty(process, 'stdout', { value: undefined, configurable: true });
    expect(() => isInteractiveEnvironment()).not.toThrow();
    expect(isInteractiveEnvironment()).toBe(false);
  });
});
