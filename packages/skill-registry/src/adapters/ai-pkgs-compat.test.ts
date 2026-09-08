import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveAiPkgsTimeoutMs } from './ai-pkgs-compat.js';

const ENV_KEYS = ['SKILL_REGISTRY_AI_PKGS_TIMEOUT_MS'] as const;

function saveEnv(): Record<string, string | undefined> {
  const saved: Record<string, string | undefined> = {};
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    Reflect.deleteProperty(process.env, key);
  }
  return saved;
}

function restoreEnv(saved: Record<string, string | undefined>): void {
  for (const key of ENV_KEYS) {
    if (saved[key] !== undefined) {
      process.env[key] = saved[key];
    } else {
      Reflect.deleteProperty(process.env, key);
    }
  }
}

describe('resolveAiPkgsTimeoutMs', () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = saveEnv();
  });

  afterEach(() => {
    restoreEnv(saved);
  });

  it('returns undefined when env var is unset', () => {
    expect(resolveAiPkgsTimeoutMs()).toBeUndefined();
  });

  it('parses a positive value', () => {
    expect(resolveAiPkgsTimeoutMs({ SKILL_REGISTRY_AI_PKGS_TIMEOUT_MS: '1500' })).toBe(1500);
  });

  it.each(['0', '-5', 'abc', ''])('returns undefined for invalid value %s', (value) => {
    expect(resolveAiPkgsTimeoutMs({ SKILL_REGISTRY_AI_PKGS_TIMEOUT_MS: value })).toBeUndefined();
  });

  it('reads process.env by default', () => {
    process.env.SKILL_REGISTRY_AI_PKGS_TIMEOUT_MS = '1500';
    expect(resolveAiPkgsTimeoutMs()).toBe(1500);
  });
});
