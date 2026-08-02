import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { checkDocTruth } from '../check-doc-truth.js';

const ROOT = resolve(import.meta.dirname, '../..');

describe('checkDocTruth', () => {
  it('returns no drifts for current repository', () => {
    const result = checkDocTruth(ROOT);
    expect(result.drifts).toEqual([]);
  });

  it('returns manifest with all sections', () => {
    const result = checkDocTruth(ROOT);
    expect(result.manifest.scripts.length).toBeGreaterThan(0);
    expect(result.manifest.workspacePackages.length).toBeGreaterThan(0);
    expect(result.manifest.ciGuardrails.length).toBeGreaterThan(0);
    expect(result.manifest.runtimeRoutes.length).toBeGreaterThan(0);
  });

  it('verifies critical CI guards are blocking', () => {
    const result = checkDocTruth(ROOT);
    const criticalGuards = ['check:docs-drift', 'check:structure', 'check:mermaid'];
    for (const guard of criticalGuards) {
      const found = result.manifest.ciGuardrails.find((g) => g.name === guard);
      expect(found).toBeDefined();
      expect(found!.blocking).toBe(true);
    }
  });

  it('verifies required scripts exist', () => {
    const result = checkDocTruth(ROOT);
    const requiredScripts = [
      'build',
      'test',
      'typecheck',
      'check:docs-drift',
      'check:doc-references',
    ];
    for (const script of requiredScripts) {
      const found = result.manifest.scripts.find((s) => s.name === script);
      expect(found).toBeDefined();
    }
  });

  it('verifies required packages exist', () => {
    const result = checkDocTruth(ROOT);
    const requiredPackages = ['contracts', 'host-local', 'host-distributed', 'backend-core'];
    for (const pkg of requiredPackages) {
      const found = result.manifest.workspacePackages.find((p) => p.name === pkg);
      expect(found).toBeDefined();
    }
  });

  it('verifies required runtime routes exist', () => {
    const result = checkDocTruth(ROOT);
    const requiredRoutes = ['/health', '/ready', '/metrics'];
    for (const route of requiredRoutes) {
      const found = result.manifest.runtimeRoutes.find((r) => r.path === route);
      expect(found).toBeDefined();
    }
  });
});
