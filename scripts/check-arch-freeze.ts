import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { finishCheckRun } from './lib/check-result.js';

// ── Types ────────────────────────────────────────────────────────────

export interface ArchFreezeFileRule {
  mustContain?: string[];
  mustNotContain?: string[];
  mustExist?: boolean;
}

export interface ArchFreezeRule {
  id: string;
  description: string;
  files: Record<string, ArchFreezeFileRule>;
}

export interface ArchFreezeConfig {
  archFreezeRules: ArchFreezeRule[];
}

export interface CheckResult {
  failures: number;
  messages: string[];
}

// ── Checking logic (testable) ────────────────────────────────────────

/**
 * Check a single file against an ArchFreezeFileRule.
 * Returns failure messages (empty array = pass).
 */
export function checkFile(
  fileRule: ArchFreezeFileRule,
  filePath: string,
  content: string | null,
): string[] {
  const msgs: string[] = [];

  // mustExist
  if (fileRule.mustExist && content === null) {
    msgs.push(`[arch-freeze] FAIL: ${filePath} must exist but was not found`);
    return msgs; // no point checking content if file doesn't exist
  }

  if (content === null) {
    // File doesn't exist and mustExist is not set — that's an implicit fail for any content checks
    msgs.push(`[arch-freeze] FAIL: ${filePath} cannot be read`);
    return msgs;
  }

  // mustContain
  if (fileRule.mustContain) {
    for (const phrase of fileRule.mustContain) {
      if (!content.includes(phrase)) {
        msgs.push(`[arch-freeze] FAIL: ${filePath} must contain "${phrase}" but does not`);
      }
    }
  }

  // mustNotContain
  if (fileRule.mustNotContain) {
    for (const phrase of fileRule.mustNotContain) {
      if (content.includes(phrase)) {
        msgs.push(`[arch-freeze] FAIL: ${filePath} must NOT contain "${phrase}" but does`);
      }
    }
  }

  return msgs;
}

/**
 * Validate a single ArchFreezeRule against the codebase.
 * Uses a readFile function for testability.
 * Returns failure messages (empty array = pass).
 */
export function checkArchFreezeRule(
  rule: ArchFreezeRule,
  readFile: (path: string) => string | null,
): string[] {
  const msgs: string[] = [];

  for (const [filePath, fileRule] of Object.entries(rule.files)) {
    const content = readFile(filePath);
    msgs.push(...checkFile(fileRule, filePath, content));
  }

  return msgs;
}

/**
 * Run all arch-freeze rules from a config file.
 * Pure function — no side effects beyond reading files.
 */
export function checkArchFreeze(configPath: string, root?: string): CheckResult {
  const raw = readFileSync(configPath, 'utf-8');
  const config: ArchFreezeConfig = JSON.parse(raw);
  const baseDir = root ?? resolve(configPath, '..');
  const messages: string[] = [];

  const readFile = (relativePath: string): string | null => {
    const absPath = resolve(baseDir, relativePath);
    if (!existsSync(absPath)) return null;
    return readFileSync(absPath, 'utf-8');
  };

  for (const rule of config.archFreezeRules) {
    const ruleMessages = checkArchFreezeRule(rule, readFile);
    messages.push(...ruleMessages);
  }

  return { failures: messages.length, messages };
}

// ── CLI entry point ──────────────────────────────────────────────────

const ROOT = resolve(import.meta.dirname, '..');
const CONFIG_PATH = resolve(ROOT, 'scripts/arch-freeze-rules.json');

function main(): void {
  const result = checkArchFreeze(CONFIG_PATH, ROOT);
  const raw = readFileSync(CONFIG_PATH, 'utf-8');
  const config: ArchFreezeConfig = JSON.parse(raw);

  finishCheckRun({
    name: '[arch-freeze]',
    result,
    remedy: 'Fix the source code or update the rules.',
    passedMessage: `[arch-freeze] All ${config.archFreezeRules.length} rule(s) passed.`,
  });
}

// Only run when executed directly, not when imported (e.g. by tests).
const isDirectRun = !process.env.VITEST && process.argv[1]?.includes('check-arch-freeze');
if (isDirectRun) {
  main();
}
