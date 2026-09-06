/**
 * Documentation Truth Checker
 *
 * Compares extracted truth manifest against documentation claims.
 * Reports field-level drift between source facts and documented values.
 */

import { resolve } from 'node:path';
import { type DocTruthManifest, extractDocTruthManifest } from './extract-doc-truth.js';

// ── Types ────────────────────────────────────────────────────────────

export interface TruthDrift {
  category: string;
  field: string;
  expected: string | number | boolean;
  actual: string | number | boolean;
  source: string;
}

export interface CheckResult {
  drifts: TruthDrift[];
  manifest: DocTruthManifest;
}

// ── Checking logic ───────────────────────────────────────────────────

/**
 * Check truth manifest against documentation.
 * Returns drifts found between source facts and documented values.
 */
export function checkDocTruth(root: string): CheckResult {
  const manifest = extractDocTruthManifest(root);
  const drifts: TruthDrift[] = [];

  // Check scripts exist in package.json
  const expectedScripts = [
    'build',
    'test',
    'typecheck',
    'check:docs',
    'check:structure',
    'check:asserts',
  ];
  for (const script of expectedScripts) {
    const found = manifest.scripts.find((s) => s.name === script);
    if (!found) {
      drifts.push({
        category: 'scripts',
        field: script,
        expected: 'present',
        actual: 'missing',
        source: 'package.json',
      });
    }
  }

  // Check workspace packages exist
  const expectedPackages = ['contracts', 'host-local', 'host-distributed', 'backend-core'];
  for (const pkg of expectedPackages) {
    const found = manifest.workspacePackages.find((p) => p.name === pkg);
    if (!found) {
      drifts.push({
        category: 'workspacePackages',
        field: pkg,
        expected: 'present',
        actual: 'missing',
        source: 'packages/',
      });
    }
  }

  // Check CI guardrails are blocking
  const criticalGuards = ['check:docs', 'check:structure', 'check:asserts'];
  for (const guard of criticalGuards) {
    const found = manifest.ciGuardrails.find((g) => g.name === guard);
    if (found && !found.blocking) {
      drifts.push({
        category: 'ciGuardrails',
        field: guard,
        expected: true,
        actual: false,
        source: '.github/workflows/ci.yml',
      });
    }
  }

  // Check runtime routes exist
  const expectedRoutes = ['/health', '/ready', '/metrics'];
  for (const route of expectedRoutes) {
    const found = manifest.runtimeRoutes.find((r) => r.path === route);
    if (!found) {
      drifts.push({
        category: 'runtimeRoutes',
        field: route,
        expected: 'present',
        actual: 'missing',
        source: 'host-local',
      });
    }
  }

  return { drifts, manifest };
}

// ── CLI entry point ──────────────────────────────────────────────────

const ROOT = resolve(import.meta.dirname, '..');

function main(): void {
  const result = checkDocTruth(ROOT);

  if (result.drifts.length > 0) {
    for (const drift of result.drifts) {
      console.error(
        `[doc-truth] FAIL: ${drift.category}.${drift.field} — expected ${JSON.stringify(drift.expected)} but found ${JSON.stringify(drift.actual)} (source: ${drift.source})`,
      );
    }
    console.error(`\n[doc-truth] ${result.drifts.length} drift(s) found.`);
    process.exit(1);
  }

  console.log(
    `[doc-truth] All truth checks passed. Manifest generated at ${result.manifest.generatedAt}`,
  );
}

const isDirectRun = !process.env.VITEST && process.argv[1]?.includes('check-doc-truth');
if (isDirectRun) {
  main();
}
