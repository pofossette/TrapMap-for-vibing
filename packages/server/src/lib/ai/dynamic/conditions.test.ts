import { describe, expect, it } from 'vitest';

import {
  type ConditionalRule,
  type RuntimeContext,
  getConditionalContent,
  getDefaultConditionalRules,
} from './conditions.js';

// ---------------------------------------------------------------------------
// getConditionalContent
// ---------------------------------------------------------------------------

describe('getConditionalContent', () => {
  const baseContext: RuntimeContext = {
    isPlanMode: false,
    modelType: 'claude-opus-4-6',
    taskType: 'knowledge-refinement',
  };

  it('appends trueContent when condition matches', () => {
    const rules: ConditionalRule[] = [
      {
        name: 'always',
        condition: () => true,
        trueContent: 'matched',
      },
    ];
    expect(getConditionalContent(rules, baseContext)).toBe('matched');
  });

  it('appends falseContent when condition does not match', () => {
    const rules: ConditionalRule[] = [
      {
        name: 'never',
        condition: () => false,
        trueContent: 'yes',
        falseContent: 'no',
      },
    ];
    expect(getConditionalContent(rules, baseContext)).toBe('no');
  });

  it('skips rules whose condition is false and have no falseContent', () => {
    const rules: ConditionalRule[] = [
      {
        name: 'skip',
        condition: () => false,
        trueContent: 'ignored',
      },
    ];
    expect(getConditionalContent(rules, baseContext)).toBe('');
  });

  it('concatenates content from multiple matching rules with newline', () => {
    const rules: ConditionalRule[] = [
      { name: 'a', condition: () => true, trueContent: 'A' },
      { name: 'b', condition: () => true, trueContent: 'B' },
    ];
    expect(getConditionalContent(rules, baseContext)).toBe('A\nB');
  });

  it('returns empty string for empty rules', () => {
    expect(getConditionalContent([], baseContext)).toBe('');
  });

  it('passes context to the condition function', () => {
    let receivedCtx: RuntimeContext | undefined;
    const rules: ConditionalRule[] = [
      {
        name: 'capture',
        condition: (ctx) => {
          receivedCtx = ctx;
          return false;
        },
        trueContent: '',
      },
    ];
    getConditionalContent(rules, baseContext);
    expect(receivedCtx).toBe(baseContext);
  });
});

// ---------------------------------------------------------------------------
// getDefaultConditionalRules
// ---------------------------------------------------------------------------

describe('getDefaultConditionalRules', () => {
  const rules = getDefaultConditionalRules();

  it('returns three default rules', () => {
    expect(rules).toHaveLength(3);
    expect(rules.map((r) => r.name)).toEqual([
      'plan_mode',
      'deepseek_optimization',
      'boundary_extraction_task',
    ]);
  });

  describe('plan_mode rule', () => {
    const rule = rules[0];

    it('activates when isPlanMode is true', () => {
      const ctx: RuntimeContext = {
        isPlanMode: true,
        modelType: 'claude-opus-4-6',
        taskType: 'knowledge-refinement',
      };
      expect(rule.condition(ctx)).toBe(true);
    });

    it('does not activate when isPlanMode is false', () => {
      const ctx: RuntimeContext = {
        isPlanMode: false,
        modelType: 'claude-opus-4-6',
        taskType: 'knowledge-refinement',
      };
      expect(rule.condition(ctx)).toBe(false);
    });
  });

  describe('deepseek_optimization rule', () => {
    const rule = rules[1];

    it('activates for deepseek models', () => {
      const ctx: RuntimeContext = {
        isPlanMode: false,
        modelType: 'deepseek-chat',
        taskType: 'knowledge-refinement',
      };
      expect(rule.condition(ctx)).toBe(true);
    });

    it('does not activate for non-deepseek models', () => {
      const ctx: RuntimeContext = {
        isPlanMode: false,
        modelType: 'claude-opus-4-6',
        taskType: 'knowledge-refinement',
      };
      expect(rule.condition(ctx)).toBe(false);
    });
  });

  describe('boundary_extraction_task rule', () => {
    const rule = rules[2];

    it('activates for boundary-extraction task', () => {
      const ctx: RuntimeContext = {
        isPlanMode: false,
        modelType: 'claude-opus-4-6',
        taskType: 'boundary-extraction',
      };
      expect(rule.condition(ctx)).toBe(true);
    });

    it('does not activate for other tasks', () => {
      const ctx: RuntimeContext = {
        isPlanMode: false,
        modelType: 'claude-opus-4-6',
        taskType: 'knowledge-refinement',
      };
      expect(rule.condition(ctx)).toBe(false);
    });
  });
});
