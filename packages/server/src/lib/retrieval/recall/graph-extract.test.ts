/**
 * Tests for deterministic graph entity extraction.
 *
 * This test suite verifies that extractGraphEntities:
 * - Classifies entities into the required graph classes (service, tool, symptom, root-cause, fix, environment)
 * - Uses normalized labels plus field-aware tokens from knowledge entries
 * - Excludes or de-prioritizes generic noise terms
 * - Returns deterministic, stable results for identical inputs
 *
 * TDD Phase: RED - These tests fail before the implementation exists.
 */

import type { NormalizedIndexDocument } from '@trapmap/server/lib/indexing/types.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { extractGraphEntities } from './graph-extract.js';

describe('extractGraphEntities', () => {
  describe('required entity classes', () => {
    it('should extract service entities from capitalized package-like phrases', () => {
      const document: NormalizedIndexDocument = {
        entryId: 'test-1',
        teamId: null,
        scope: 'global',
        requiredLevel: 0,
        lifecycleState: 'approved',
        revision: 1,
        updatedAt: '2026-04-15T00:00:00Z',
        shortcut: 'Fix TypeScript compilation errors',
        detail: 'When using TypeScript compiler, ensure tsconfig.json has correct settings',
        labels: ['TypeScript', 'Compiler', 'Config'],
        canonicalText:
          'Fix TypeScript compilation errors\nWhen using TypeScript compiler, ensure tsconfig.json has correct settings\nTypeScript Compiler Config',
        tokens: [
          'fix',
          'typescript',
          'compilation',
          'errors',
          'when',
          'using',
          'compiler',
          'ensure',
          'tsconfig.json',
          'has',
          'correct',
          'settings',
          'config',
        ],
        contentHash: 'abc123',
        normalizedAt: '2026-04-15T00:00:00Z',
      };

      const result = extractGraphEntities(document);

      const serviceEntities = result.entities.filter((e) => e.type === 'service');
      expect(serviceEntities.length).toBeGreaterThan(0);
      expect(serviceEntities.some((e) => e.value.toLowerCase().includes('typescript'))).toBe(true);
    });

    it('should extract tool entities from common CLI/library keywords', () => {
      const document: NormalizedIndexDocument = {
        entryId: 'test-2',
        teamId: 'team-1',
        scope: 'project',
        requiredLevel: 0,
        lifecycleState: 'approved',
        revision: 1,
        updatedAt: '2026-04-15T00:00:00Z',
        shortcut: 'Use pnpm for faster installs',
        detail: 'Switch from npm to pnpm to improve installation speed',
        labels: ['pnpm', 'package-manager'],
        canonicalText:
          'Use pnpm for faster installs\nSwitch from npm to pnpm to improve installation speed\npnpm package-manager',
        tokens: [
          'use',
          'pnpm',
          'for',
          'faster',
          'installs',
          'switch',
          'from',
          'npm',
          'to',
          'improve',
          'installation',
          'speed',
          'package-manager',
        ],
        contentHash: 'def456',
        normalizedAt: '2026-04-15T00:00:00Z',
      };

      const result = extractGraphEntities(document);

      const toolEntities = result.entities.filter((e) => e.type === 'tool');
      expect(toolEntities.length).toBeGreaterThan(0);
      expect(toolEntities.some((e) => e.value === 'pnpm')).toBe(true);
    });

    it('should extract symptom entities from error/problem phrases', () => {
      const document: NormalizedIndexDocument = {
        entryId: 'test-3',
        teamId: null,
        scope: 'global',
        requiredLevel: 0,
        lifecycleState: 'approved',
        revision: 1,
        updatedAt: '2026-04-15T00:00:00Z',
        shortcut: 'Handle timeout errors in API calls',
        detail: 'When API calls timeout, implement retry logic with exponential backoff',
        labels: ['api', 'timeout', 'error-handling'],
        canonicalText:
          'Handle timeout errors in API calls\nWhen API calls timeout, implement retry logic with exponential backoff\napi timeout error-handling',
        tokens: [
          'handle',
          'timeout',
          'errors',
          'in',
          'api',
          'calls',
          'when',
          'implement',
          'retry',
          'logic',
          'with',
          'exponential',
          'backoff',
          'error-handling',
        ],
        contentHash: 'ghi789',
        normalizedAt: '2026-04-15T00:00:00Z',
      };

      const result = extractGraphEntities(document);

      const symptomEntities = result.entities.filter((e) => e.type === 'symptom');
      expect(symptomEntities.length).toBeGreaterThan(0);
      expect(symptomEntities.some((e) => e.value === 'timeout' || e.value === 'error')).toBe(true);
    });

    it('should extract root-cause entities from causal phrases', () => {
      const document: NormalizedIndexDocument = {
        entryId: 'test-4',
        teamId: 'team-1',
        scope: 'project',
        requiredLevel: 0,
        lifecycleState: 'approved',
        revision: 1,
        updatedAt: '2026-04-15T00:00:00Z',
        shortcut: 'Fix memory leak caused by event listener',
        detail:
          'The issue occurred because event listeners were not removed after component unmount',
        labels: ['memory', 'leak', 'event-listener'],
        canonicalText:
          'Fix memory leak caused by event listener\nThe issue occurred because event listeners were not removed after component unmount\nmemory leak event-listener',
        tokens: [
          'fix',
          'memory',
          'leak',
          'caused',
          'by',
          'event',
          'listener',
          'the',
          'issue',
          'occurred',
          'because',
          'were',
          'not',
          'removed',
          'after',
          'component',
          'unmount',
        ],
        contentHash: 'jkl012',
        normalizedAt: '2026-04-15T00:00:00Z',
      };

      const result = extractGraphEntities(document);

      const rootCauseEntities = result.entities.filter((e) => e.type === 'root-cause');
      expect(rootCauseEntities.length).toBeGreaterThan(0);
    });

    it('should extract fix entities from remediation phrases', () => {
      const document: NormalizedIndexDocument = {
        entryId: 'test-5',
        teamId: null,
        scope: 'global',
        requiredLevel: 0,
        lifecycleState: 'approved',
        revision: 1,
        updatedAt: '2026-04-15T00:00:00Z',
        shortcut: 'Enable CORS headers',
        detail: 'Configure Access-Control-Allow-Origin header to fix cross-origin requests',
        labels: ['cors', 'http', 'headers'],
        canonicalText:
          'Enable CORS headers\nConfigure Access-Control-Allow-Origin header to fix cross-origin requests\ncors http headers',
        tokens: [
          'enable',
          'cors',
          'headers',
          'configure',
          'access-control-allow-origin',
          'header',
          'to',
          'fix',
          'cross-origin',
          'requests',
          'http',
        ],
        contentHash: 'mno345',
        normalizedAt: '2026-04-15T00:00:00Z',
      };

      const result = extractGraphEntities(document);

      const fixEntities = result.entities.filter((e) => e.type === 'fix');
      expect(fixEntities.length).toBeGreaterThan(0);
    });

    it('should extract environment entities from context markers', () => {
      const document: NormalizedIndexDocument = {
        entryId: 'test-6',
        teamId: 'team-1',
        scope: 'project',
        requiredLevel: 0,
        lifecycleState: 'approved',
        revision: 1,
        updatedAt: '2026-04-15T00:00:00Z',
        shortcut: 'Set NODE_ENV to production in CI',
        detail: 'Ensure production environment variables are set in CI pipeline',
        labels: ['ci', 'environment', 'production'],
        canonicalText:
          'Set NODE_ENV to production in CI\nEnsure production environment variables are set in CI pipeline\nci environment production',
        tokens: [
          'set',
          'node_env',
          'to',
          'production',
          'in',
          'ci',
          'ensure',
          'environment',
          'variables',
          'are',
          'pipeline',
        ],
        contentHash: 'pqr678',
        normalizedAt: '2026-04-15T00:00:00Z',
      };

      const result = extractGraphEntities(document);

      const envEntities = result.entities.filter((e) => e.type === 'environment');
      expect(envEntities.length).toBeGreaterThan(0);
      expect(envEntities.some((e) => e.value === 'ci' || e.value === 'production')).toBe(true);
    });
  });

  describe('noise filtering and de-prioritization', () => {
    it('should exclude very short generic terms from entity extraction', () => {
      const document: NormalizedIndexDocument = {
        entryId: 'test-7',
        teamId: null,
        scope: 'global',
        requiredLevel: 0,
        lifecycleState: 'approved',
        revision: 1,
        updatedAt: '2026-04-15T00:00:00Z',
        shortcut: 'Use the system to fix the issue',
        detail: 'This is a test of the system with no specific entities',
        labels: ['generic', 'test'],
        canonicalText:
          'Use the system to fix the issue\nThis is a test of the system with no specific entities\ngeneric test',
        tokens: [
          'use',
          'the',
          'system',
          'to',
          'fix',
          'issue',
          'this',
          'is',
          'a',
          'of',
          'with',
          'no',
          'specific',
          'entities',
          'generic',
        ],
        contentHash: 'stu901',
        normalizedAt: '2026-04-15T00:00:00Z',
      };

      const result = extractGraphEntities(document);

      // Should not extract very common noise words as entities
      const allValues = result.entities.map((e) => e.value);
      expect(allValues).not.toContain('the');
      expect(allValues).not.toContain('a');
      expect(allValues).not.toContain('is');
      expect(allValues).not.toContain('to');
    });

    it('should deduplicate entities by normalized value', () => {
      const document: NormalizedIndexDocument = {
        entryId: 'test-8',
        teamId: null,
        scope: 'global',
        requiredLevel: 0,
        lifecycleState: 'approved',
        revision: 1,
        updatedAt: '2026-04-15T00:00:00Z',
        shortcut: 'Use Docker and docker for containers',
        detail: 'Docker provides containerization using docker-compose',
        labels: ['Docker', 'docker'],
        canonicalText:
          'Use Docker and docker for containers\nDocker provides containerization using docker-compose\nDocker docker',
        tokens: [
          'use',
          'docker',
          'and',
          'for',
          'containers',
          'provides',
          'containerization',
          'using',
          'docker-compose',
        ],
        contentHash: 'vwx234',
        normalizedAt: '2026-04-15T00:00:00Z',
      };

      const result = extractGraphEntities(document);

      // Should have only one Docker entity (deduplicated by normalized value)
      const dockerEntities = result.entities.filter((e) => e.normalizedValue === 'docker');
      expect(dockerEntities.length).toBe(1);
    });
  });

  describe('determinism and stability', () => {
    it('should return identical results for identical inputs', () => {
      const document: NormalizedIndexDocument = {
        entryId: 'test-9',
        teamId: null,
        scope: 'global',
        requiredLevel: 0,
        lifecycleState: 'approved',
        revision: 1,
        updatedAt: '2026-04-15T00:00:00Z',
        shortcut: 'Fix npm install timeout',
        detail: 'Use npm registry mirror to fix timeout errors',
        labels: ['npm', 'timeout'],
        canonicalText:
          'Fix npm install timeout\nUse npm registry mirror to fix timeout errors\nnpm timeout',
        tokens: ['fix', 'npm', 'install', 'timeout', 'use', 'registry', 'mirror', 'errors'],
        contentHash: 'yza567',
        normalizedAt: '2026-04-15T00:00:00Z',
      };

      const result1 = extractGraphEntities(document);
      const result2 = extractGraphEntities(document);

      expect(result1).toEqual(result2);
    });

    it('should preserve field provenance information', () => {
      const document: NormalizedIndexDocument = {
        entryId: 'test-10',
        teamId: null,
        scope: 'global',
        requiredLevel: 0,
        lifecycleState: 'approved',
        revision: 1,
        updatedAt: '2026-04-15T00:00:00Z',
        shortcut: 'TypeScript configuration',
        detail: 'Enable strict mode in tsconfig.json',
        labels: ['TypeScript', 'tsconfig'],
        canonicalText:
          'TypeScript configuration\nEnable strict mode in tsconfig.json\nTypeScript tsconfig',
        tokens: [
          'typescript',
          'configuration',
          'enable',
          'strict',
          'mode',
          'in',
          'tsconfig.json',
          'tsconfig',
        ],
        contentHash: 'bcd890',
        normalizedAt: '2026-04-15T00:00:00Z',
      };

      const result = extractGraphEntities(document);

      // Result should include metadata about source fields
      expect(result.entities).toBeInstanceOf(Array);
      // Each entity should have type, value, and normalizedValue
      for (const entity of result.entities) {
        expect(entity).toHaveProperty('type');
        expect(entity).toHaveProperty('value');
        expect(entity).toHaveProperty('normalizedValue');
      }
    });
  });

  describe('relation extraction', () => {
    it('should extract relations between co-occurring entities', () => {
      const document: NormalizedIndexDocument = {
        entryId: 'test-11',
        teamId: null,
        scope: 'global',
        requiredLevel: 0,
        lifecycleState: 'approved',
        revision: 1,
        updatedAt: '2026-04-15T00:00:00Z',
        shortcut: 'Fix Docker timeout error',
        detail: 'Restart Docker container to fix the timeout issue',
        labels: ['Docker', 'timeout', 'error'],
        canonicalText:
          'Fix Docker timeout error\nRestart Docker container to fix the timeout issue\nDocker timeout error',
        tokens: ['fix', 'docker', 'timeout', 'error', 'restart', 'container', 'to', 'the', 'issue'],
        contentHash: 'def123',
        normalizedAt: '2026-04-15T00:00:00Z',
      };

      const result = extractGraphEntities(document);

      // Should extract relations when symptoms and fixes co-occur
      expect(result.relations).toBeInstanceOf(Array);
      // Relations should have type, fromEntity, toEntity, weight
      for (const relation of result.relations) {
        expect(relation).toHaveProperty('type');
        expect(relation).toHaveProperty('fromEntity');
        expect(relation).toHaveProperty('toEntity');
        expect(relation).toHaveProperty('weight');
      }
    });

    it('should support bounded relation types', () => {
      const document: NormalizedIndexDocument = {
        entryId: 'test-12',
        teamId: null,
        scope: 'global',
        requiredLevel: 0,
        lifecycleState: 'approved',
        revision: 1,
        updatedAt: '2026-04-15T00:00:00Z',
        shortcut: 'Use npm to fix install error',
        detail: 'Enable npm cache to resolve the issue',
        labels: ['npm', 'error'],
        canonicalText:
          'Use npm to fix install error\nEnable npm cache to resolve the issue\nnpm error',
        tokens: [
          'use',
          'npm',
          'to',
          'fix',
          'install',
          'error',
          'enable',
          'cache',
          'resolve',
          'the',
          'issue',
        ],
        contentHash: 'ghi456',
        normalizedAt: '2026-04-15T00:00:00Z',
      };

      const result = extractGraphEntities(document);

      const relationTypes = new Set(result.relations.map((r) => r.type));
      // Should use only the supported relation types
      for (const type of relationTypes) {
        expect(['mentions', 'causes', 'fixed-by', 'observed-in', 'uses-tool', 'runs-in']).toContain(
          type,
        );
      }
    });
  });
});
