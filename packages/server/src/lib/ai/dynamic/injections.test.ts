import { describe, expect, it } from 'vitest';

import { type DynamicInjection, escapeRegExp, injectDynamicContent } from './injections.js';

// ---------------------------------------------------------------------------
// escapeRegExp
// ---------------------------------------------------------------------------

describe('escapeRegExp', () => {
  it('escapes all regex special characters', () => {
    expect(escapeRegExp('$ { } ( ) | [ ] . * + ? ^ \\')).toBe(
      '\\$ \\{ \\} \\( \\) \\| \\[ \\] \\. \\* \\+ \\? \\^ \\\\',
    );
  });

  it('returns plain strings unchanged', () => {
    expect(escapeRegExp('hello-world_123')).toBe('hello-world_123');
  });

  it('handles empty string', () => {
    expect(escapeRegExp('')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// injectDynamicContent
// ---------------------------------------------------------------------------

describe('injectDynamicContent', () => {
  it('replaces a single placeholder', () => {
    const injections: DynamicInjection[] = [
      { type: 'env', placeholder: '${NAME}', resolver: () => 'Alice' },
    ];
    const result = injectDynamicContent('Hello ${NAME}!', injections);
    expect(result.injected).toBe('Hello Alice!');
    expect(result.unresolvedPlaceholders).toEqual([]);
  });

  it('replaces multiple occurrences of the same placeholder', () => {
    const injections: DynamicInjection[] = [
      { type: 'env', placeholder: '${X}', resolver: () => '42' },
    ];
    const result = injectDynamicContent('${X} + ${X} = 84', injections);
    expect(result.injected).toBe('42 + 42 = 84');
  });

  it('handles multiple distinct placeholders', () => {
    const injections: DynamicInjection[] = [
      { type: 'env', placeholder: '${A}', resolver: () => 'alpha' },
      { type: 'env', placeholder: '${B}', resolver: (): string => 'beta' },
    ];
    const result = injectDynamicContent('${A}-${B}', injections);
    expect(result.injected).toBe('alpha-beta');
  });

  it('collects unresolved placeholders when resolver returns null', () => {
    const injections: DynamicInjection[] = [
      { type: 'env', placeholder: '${MISSING}', resolver: () => null },
    ];
    const result = injectDynamicContent('val=${MISSING}', injections);
    expect(result.injected).toBe('val=${MISSING}');
    expect(result.unresolvedPlaceholders).toEqual(['${MISSING}']);
  });

  it('collects unresolved placeholders when resolver returns undefined', () => {
    const injections: DynamicInjection[] = [
      { type: 'env', placeholder: '${UNDEF}', resolver: () => undefined },
    ];
    const result = injectDynamicContent('${UNDEF}', injections);
    expect(result.unresolvedPlaceholders).toEqual(['${UNDEF}']);
  });

  it('handles mixed resolved and unresolved injections', () => {
    const injections: DynamicInjection[] = [
      { type: 'env', placeholder: '${OK}', resolver: () => 'yes' },
      { type: 'env', placeholder: '${FAIL}', resolver: () => null },
    ];
    const result = injectDynamicContent('${OK}-${FAIL}', injections);
    expect(result.injected).toBe('yes-${FAIL}');
    expect(result.unresolvedPlaceholders).toEqual(['${FAIL}']);
  });

  it('returns the original template unchanged when no injections match', () => {
    const injections: DynamicInjection[] = [
      { type: 'env', placeholder: '${NO_MATCH}', resolver: () => 'val' },
    ];
    const template = 'nothing to replace here';
    const result = injectDynamicContent(template, injections);
    expect(result.injected).toBe(template);
  });

  it('handles empty injections array', () => {
    const result = injectDynamicContent('hello', []);
    expect(result.injected).toBe('hello');
    expect(result.unresolvedPlaceholders).toEqual([]);
  });

  it('handles empty template', () => {
    const injections: DynamicInjection[] = [
      { type: 'env', placeholder: '${X}', resolver: () => 'v' },
    ];
    const result = injectDynamicContent('', injections);
    expect(result.injected).toBe('');
  });

  it('safely handles placeholders with regex-special characters', () => {
    const injections: DynamicInjection[] = [
      { type: 'env', placeholder: '${a.b+c*d}', resolver: () => 'safe' },
    ];
    const result = injectDynamicContent('before ${a.b+c*d} after', injections);
    expect(result.injected).toBe('before safe after');
  });
});
