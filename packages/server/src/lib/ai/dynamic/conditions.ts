/**
 * Conditional content injection for runtime prompt assembly.
 *
 * Evaluates a set of rules against a RuntimeContext and concatenates
 * the content of matching rules into the prompt.
 */

import type { AiPromptTaskType } from '../providers/types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RuntimeContext {
  /** Whether the session is in plan/design mode. */
  readonly isPlanMode: boolean;
  /** The model identifier (e.g. 'claude-opus-4-6', 'deepseek-chat'). */
  readonly modelType: string;
  /** The current prompt task type. */
  readonly taskType: AiPromptTaskType;
}

export interface ConditionalRule {
  /** Human-readable rule name for debugging. */
  readonly name: string;
  /** Predicate evaluated against the current runtime context. */
  readonly condition: (context: RuntimeContext) => boolean;
  /** Content appended when the condition is true. */
  readonly trueContent: string;
  /** Optional content appended when the condition is false. */
  readonly falseContent?: string;
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluate a list of conditional rules and return the concatenation
 * of all matching content blocks.
 */
export function getConditionalContent(rules: ConditionalRule[], context: RuntimeContext): string {
  const results: string[] = [];

  for (const rule of rules) {
    if (rule.condition(context)) {
      results.push(rule.trueContent);
    } else if (rule.falseContent) {
      results.push(rule.falseContent);
    }
  }

  return results.join('\n');
}

// ---------------------------------------------------------------------------
// Default rules
// ---------------------------------------------------------------------------

/**
 * Built-in conditional rules shipped with the prompt system.
 */
export function getDefaultConditionalRules(): ConditionalRule[] {
  return [
    {
      name: 'plan_mode',
      condition: (ctx) => ctx.isPlanMode,
      trueContent: `
# Plan Mode
You are in plan mode. Focus on planning and design, not implementation.
- Ask clarifying questions before proposing solutions
- Use the TodoWrite tool to break down tasks
- Do not write code or make changes until explicitly asked
`,
    },
    {
      name: 'deepseek_optimization',
      condition: (ctx) => ctx.modelType.includes('deepseek'),
      trueContent: `
# DeepSeek Optimization
- Keep responses concise and direct
- Use JSON format for structured output
- Avoid verbose explanations
`,
    },
    {
      name: 'boundary_extraction_task',
      condition: (ctx) => ctx.taskType === 'boundary-extraction',
      trueContent: `
# Boundary Extraction Focus
- Focus on extracting structured constraints
- Prioritize actionable information
- Return JSON with predefined schema
`,
    },
  ];
}
