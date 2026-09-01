import { describe, expect, it } from 'vitest';
import { compareSemver, isValidSemver, satisfiesRange } from './semver.js';

describe('semver', () => {
  it('validates', () => {
    expect(isValidSemver('1.2.3')).toBe(true);
    expect(isValidSemver('1.2')).toBe(false);
    expect(isValidSemver('v1.2.3')).toBe(false);
  });
  it('compares', () => {
    expect(compareSemver('1.2.3', '1.2.4')).toBeLessThan(0);
    expect(compareSemver('2.0.0', '1.9.9')).toBeGreaterThan(0);
    expect(compareSemver('1.0.0-alpha', '1.0.0')).toBeLessThan(0);
  });
  it('satisfies range', () => {
    expect(satisfiesRange('1.2.3', '^1.0.0')).toBe(true);
    expect(satisfiesRange('2.0.0', '^1.0.0')).toBe(false);
    expect(satisfiesRange('1.2.5', '~1.2.3')).toBe(true);
    expect(satisfiesRange('1.3.0', '~1.2.3')).toBe(false);
    expect(satisfiesRange('1.2.3', '1.2.3')).toBe(true);
  });
});
