import { describe, expect, it } from 'vitest';
import {
  backendTargetSchema,
  normalizeBackendTarget,
  resolveBackendTargetForProfile,
} from './backend-target.js';

describe('backend target contract', () => {
  it('accepts exactly the light and heavy targets', () => {
    expect(backendTargetSchema.options).toEqual(['light', 'heavy']);
  });

  it('normalizes missing and invalid values to light', () => {
    expect(normalizeBackendTarget(undefined)).toBe('light');
    expect(normalizeBackendTarget('invalid')).toBe('light');
    expect(normalizeBackendTarget('heavy')).toBe('heavy');
  });

  it('resolves each deployment profile to its build target', () => {
    expect(resolveBackendTargetForProfile('local-agent')).toBe('light');
    expect(resolveBackendTargetForProfile('team-monolith')).toBe('light');
    expect(resolveBackendTargetForProfile('distributed')).toBe('heavy');
  });
});
