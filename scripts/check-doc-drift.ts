import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { finishCheckRun } from './lib/check-result.js';

// ── Types ────────────────────────────────────────────────────────────

export interface CountAssertion {
  /** Regex pattern string. */
  pattern: string;
  /**
   * If set: the regex must have one capture group whose captured string,
   * parsed as a number, equals this value.
   */
  expected?: number;
  /**
   * If set: the regex must match the content at least this many times.
   * Does not require a capture group.
   */
  minOccurrences?: number;
}

export interface DocRule {
  file: string;
  mustContain?: string[];
  mustNotContain?: string[];
  /** Array of regex pattern strings. Fails if any match is found. */
  mustNotContainRegex?: string[];
  /** Assert count-based constraints via regex matching. */
  mustContainCount?: CountAssertion;
  /** Content must match all of these regex patterns. */
  mustMatchRegex?: string[];
}

export interface Config {
  docRules: DocRule[];
}

// ── Checking logic (testable) ────────────────────────────────────────

export interface CheckResult {
  failures: number;
  messages: string[];
}

/**
 * Validate a single doc file against a rule.
 * Returns failure messages (empty array = pass).
 */
export function checkRule(rule: DocRule, content: string): string[] {
  return [
    ...checkMustContain(rule, content),
    ...checkMustNotContain(rule, content),
    ...checkMustNotContainRegex(rule, content),
    ...checkMustMatchRegex(rule, content),
    ...checkMustContainCount(rule, content),
  ];
}

function checkMustContain(rule: DocRule, content: string): string[] {
  const msgs: string[] = [];
  if (rule.mustContain) {
    for (const phrase of rule.mustContain) {
      if (!content.includes(phrase)) {
        msgs.push(`[doc-drift] FAIL: ${rule.file} must contain "${phrase}" but does not`);
      }
    }
  }
  return msgs;
}

function checkMustNotContain(rule: DocRule, content: string): string[] {
  const msgs: string[] = [];
  if (rule.mustNotContain) {
    for (const phrase of rule.mustNotContain) {
      if (content.includes(phrase)) {
        msgs.push(`[doc-drift] FAIL: ${rule.file} must NOT contain "${phrase}" but does`);
      }
    }
  }
  return msgs;
}

function checkMustNotContainRegex(rule: DocRule, content: string): string[] {
  const msgs: string[] = [];
  if (rule.mustNotContainRegex) {
    for (const patternStr of rule.mustNotContainRegex) {
      try {
        const re = new RegExp(patternStr);
        const match = content.match(re);
        if (match) {
          msgs.push(
            `[doc-drift] FAIL: ${rule.file} must NOT match regex /${patternStr}/ but found "${match[0]}"`,
          );
        }
      } catch (err) {
        msgs.push(
          `[doc-drift] ERROR: invalid regex "${patternStr}" in rule for ${rule.file}: ${err}`,
        );
      }
    }
  }
  return msgs;
}

function checkMustMatchRegex(rule: DocRule, content: string): string[] {
  const msgs: string[] = [];
  if (rule.mustMatchRegex) {
    for (const patternStr of rule.mustMatchRegex) {
      try {
        const re = new RegExp(patternStr, 's');
        if (!re.test(content)) {
          msgs.push(
            `[doc-drift] FAIL: ${rule.file} must match regex /${patternStr}/ but no match found`,
          );
        }
      } catch (err) {
        msgs.push(
          `[doc-drift] ERROR: invalid regex "${patternStr}" in mustMatchRegex for ${rule.file}: ${err}`,
        );
      }
    }
  }
  return msgs;
}

function checkMustContainCount(rule: DocRule, content: string): string[] {
  if (!rule.mustContainCount) return [];

  const { pattern, expected, minOccurrences } = rule.mustContainCount;
  try {
    const re = new RegExp(pattern, 'g');
    const allMatches = [...content.matchAll(re)];

    if (minOccurrences !== undefined) {
      return checkCountByMinOccurrences(rule, pattern, allMatches.length, minOccurrences);
    }
    if (expected !== undefined) {
      return checkCountByExpected(rule, content, pattern, expected);
    }
    return [
      `[doc-drift] ERROR: mustContainCount for ${rule.file} must specify either "expected" or "minOccurrences"`,
    ];
  } catch (err) {
    return [
      `[doc-drift] ERROR: invalid regex "${pattern}" in mustContainCount for ${rule.file}: ${err}`,
    ];
  }
}

function checkCountByMinOccurrences(
  rule: DocRule,
  pattern: string,
  matchCount: number,
  minOccurrences: number,
): string[] {
  // minOccurrences mode: count total matches
  if (matchCount < minOccurrences) {
    return [
      `[doc-drift] FAIL: ${rule.file} expected at least ${minOccurrences} occurrences of /${pattern}/ but found ${matchCount}`,
    ];
  }
  return [];
}

function checkCountByExpected(
  rule: DocRule,
  content: string,
  pattern: string,
  expected: number,
): string[] {
  // expected mode: extract number from first match's capture group
  const reSingle = new RegExp(pattern);
  const match = content.match(reSingle);
  if (!match) {
    return [
      `[doc-drift] FAIL: ${rule.file} must match regex /${pattern}/ to extract a count, but no match found`,
    ];
  }
  if (match[1] === undefined) {
    return [
      `[doc-drift] ERROR: regex /${pattern}/ matched but has no capture group in rule for ${rule.file}`,
    ];
  }
  const actual = Number(match[1]);
  if (Number.isNaN(actual)) {
    return [
      `[doc-drift] ERROR: regex /${pattern}/ capture group is not a number ("${match[1]}") in rule for ${rule.file}`,
    ];
  }
  if (actual !== expected) {
    return [
      `[doc-drift] FAIL: ${rule.file} expected count ${expected} but found ${actual} (from pattern /${pattern}/)`,
    ];
  }
  return [];
}

/**
 * Load docRules from the per-layer shards next to the given anchor config.
 * Falls back to the anchor file itself when no shard directory exists.
 * Exported so tests assert against the same rule set the guard enforces.
 */
export function loadDocRules(configPath: string): DocRule[] {
  const parent = resolve(configPath, '..');
  // The anchor lives inside the shard directory itself
  // (scripts/doc-rules/index.json); otherwise shards sit next to the anchor.
  const shardDir = parent.endsWith('doc-rules') ? parent : join(parent, 'doc-rules');
  let entries: string[] = [];
  try {
    entries = readdirSync(shardDir)
      .filter((name) => name.endsWith('.json'))
      .sort();
  } catch {
    entries = [];
  }
  if (entries.length > 0) {
    return entries.flatMap((name) => {
      const raw = readFileSync(join(shardDir, name), 'utf-8');
      return (JSON.parse(raw) as Config).docRules;
    });
  }
  const raw = readFileSync(configPath, 'utf-8');
  return (JSON.parse(raw) as Config).docRules;
}

/**
 * Run all doc-drift rules from the per-layer shard configs.
 * Pure function — no side effects beyond reading files.
 *
 * Shards live in <root>/scripts/doc-rules/<layer>.json
 * (reference / architecture / ops / index). The anchor is
 * scripts/doc-rules/index.json so a deleted shard directory falls back to
 * the anchor's own docRules; the legacy monolith
 * scripts/complexity-budgets.json no longer carries docRules.
 */
export function checkDocDrift(configPath: string, root?: string): CheckResult {
  const rules = loadDocRules(configPath);
  const baseDir = root ?? resolve(configPath, '..', '..');
  const messages: string[] = [];

  for (const rule of rules) {
    const filePath = resolve(baseDir, rule.file);
    let content: string;
    try {
      content = readFileSync(filePath, 'utf-8');
    } catch {
      messages.push(`[doc-drift] FAIL: cannot read ${rule.file}`);
      continue;
    }

    messages.push(...checkRule(rule, content));
  }

  return { failures: messages.length, messages };
}

// ── CLI entry point ──────────────────────────────────────────────────

const ROOT = resolve(import.meta.dirname, '..');
const CONFIG_PATH = resolve(ROOT, 'scripts/doc-rules/index.json');

function main(): void {
  const result = checkDocDrift(CONFIG_PATH, ROOT);
  const rules = loadDocRules(CONFIG_PATH);

  finishCheckRun({
    name: '[doc-drift]',
    result,
    remedy: 'Fix the docs and try again.',
    passedMessage: `[doc-drift] All ${rules.length} doc rule(s) passed.`,
  });
}

// Only run when executed directly, not when imported (e.g. by tests).
const isDirectRun = !process.env.VITEST && process.argv[1]?.includes('check-doc-drift');
if (isDirectRun) {
  main();
}
