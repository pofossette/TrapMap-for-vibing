/**
 * Phase 75: TypeScript Strict Mode Compliance — Validation Tests
 *
 * Covers 4 gaps:
 * 1. tsconfig.base.json has strict: true enabled
 * 2. No TypeScript errors exist (pnpm typecheck passes)
 * 3. All strict mode compiler options correctly configured (strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes)
 * 4. Previously-fixed type errors don't regress (numeric requiredLevel, scopes not scope, spread pattern)
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT_DIR = resolve(__dirname, '../../../../..');
const TSCONFIG_PATH = resolve(ROOT_DIR, 'tsconfig.base.json');

// ── Gap 1 & 3: tsconfig.base.json strict mode options ────────────────────

describe('Phase 75: TypeScript strict mode configuration', () => {
  it('has strict: true in tsconfig.base.json compilerOptions', () => {
    const config = JSON.parse(readFileSync(TSCONFIG_PATH, 'utf-8'));
    expect(config.compilerOptions.strict).toBe(true);
  });

  it('has noUncheckedIndexedAccess: true in tsconfig.base.json', () => {
    const config = JSON.parse(readFileSync(TSCONFIG_PATH, 'utf-8'));
    expect(config.compilerOptions.noUncheckedIndexedAccess).toBe(true);
  });

  it('has exactOptionalPropertyTypes: true in tsconfig.base.json', () => {
    const config = JSON.parse(readFileSync(TSCONFIG_PATH, 'utf-8'));
    expect(config.compilerOptions.exactOptionalPropertyTypes).toBe(true);
  });
});

// ── Gap 2: typecheck passes with 0 errors ────────────────────────────────

describe('Phase 75: typecheck produces zero errors', () => {
  it('pnpm typecheck exits with code 0 (no type errors)', { timeout: 130_000 }, () => {
    // Run typecheck from project root; should succeed silently
    const result = execSync('pnpm typecheck', {
      cwd: ROOT_DIR,
      encoding: 'utf-8',
      timeout: 120_000,
    });
    // If we get here, typecheck succeeded (exit 0)
    expect(result).toBeDefined();
  });
});

// ── Gap 4: previously-fixed type errors don't regress ────────────────────

describe('Phase 75: fixed type errors remain correct', () => {
  it('benchmark.ts uses numeric requiredLevel comparison (not string)', () => {
    const benchmarkPath = resolve(ROOT_DIR, 'packages/server/src/lib/retrieval/benchmark.ts');
    const content = readFileSync(benchmarkPath, 'utf-8');

    // The fix changed from string comparison ('user') to numeric (<= 1)
    // Verify the numeric comparison pattern exists
    expect(content).toMatch(/requiredLevel\s*<=\s*1/);

    // Verify the old string comparison does NOT exist
    expect(content).not.toMatch(/requiredLevel\s*===\s*['"]user['"]/);
  });

  it('recall-coordinator.ts uses scopes (array) not scope (singular)', () => {
    const recallPath = resolve(ROOT_DIR, 'packages/server/src/lib/retrieval/recall-coordinator.ts');
    const content = readFileSync(recallPath, 'utf-8');

    // The fix changed parsed.filters?.scope to parsed.filters?.scopes
    // Verify scopes is used when accessing filters (moved from orchestrator.ts in Phase 81)
    expect(content).toMatch(/filters\?\.scopes/);

    // Verify no raw .scope access on filters (the type uses scopes: string[])
    expect(content).not.toMatch(/filters\?\.scope\b(?!\s*:)/);
  });

  it('recall-coordinator.ts uses spread pattern for optional scope property', () => {
    const recallPath = resolve(ROOT_DIR, 'packages/server/src/lib/retrieval/recall-coordinator.ts');
    const content = readFileSync(recallPath, 'utf-8');

    // For exactOptionalPropertyTypes compliance, optional properties are
    // conditionally included via spread: ...(condition ? { prop: val } : {})
    // (moved from orchestrator.ts in Phase 81)
    expect(content).toMatch(/\.\.\.\s*\(.*\?\s*\{\s*scope:/);
  });
});
