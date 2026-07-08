import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { closePlatformAdapterSafely, publishPlatformEventSafely } from './adapter.js';
import { createJsonArchiveAdapter } from './json-archive-adapter.js';

describe('platform adapters', () => {
  it('warns instead of throwing when an adapter publish fails', async () => {
    const warn = vi.fn();
    const adapter = {
      kind: 'broken',
      async publish() {
        throw new Error('archive unavailable');
      },
      async close() {},
    };

    await expect(
      publishPlatformEventSafely(adapter, warn, {
        family: 'EvalRunStarted',
        suite: 'retrieval',
        tier: 'smoke',
        runId: 'run-warning',
        caseId: null,
        scenarioId: null,
        timestamp: '2026-07-03T00:00:00.000Z',
        tags: [],
        payload: {
          reportMeta: {
            schemaVersion: 1,
            timestamp: '2026-07-03T00:00:00.000Z',
            options: {
              tier: 'smoke',
              dryRun: true,
              allowEmpty: false,
              verbose: 0,
            },
          },
          runScope: {
            tier: 'smoke',
            dryRun: true,
            allowEmpty: false,
            endpoint: '/v1/retrieval/search',
            verbose: false,
            caseCount: 1,
            scenarioIds: ['scenario-1'],
          },
        },
      }),
    ).resolves.toEqual({ ok: false });

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('broken'),
      expect.objectContaining({ message: 'archive unavailable' }),
    );
  });

  it('warns instead of throwing when adapter close fails', async () => {
    const warn = vi.fn();
    const adapter = {
      kind: 'broken',
      async publish() {},
      async close() {
        throw new Error('close unavailable');
      },
    };

    await expect(closePlatformAdapterSafely(adapter, warn)).resolves.toEqual({ ok: false });

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('broken'),
      expect.objectContaining({ message: 'close unavailable' }),
    );
  });

  it('archives mirrored platform events under reports-compatible output', async () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'trapmap-platform-'));
    const adapter = createJsonArchiveAdapter({ outputDir });

    await adapter.publish({
      family: 'EvalRunStarted',
      suite: 'retrieval',
      tier: 'smoke',
      runId: 'run-archive',
      caseId: null,
      scenarioId: null,
      timestamp: '2026-07-03T00:00:00.000Z',
      tags: ['dry-run'],
      payload: {
        reportMeta: {
          schemaVersion: 1,
          timestamp: '2026-07-03T00:00:00.000Z',
          options: {
            tier: 'smoke',
            dryRun: true,
            allowEmpty: false,
            verbose: 0,
          },
        },
        runScope: {
          tier: 'smoke',
          dryRun: true,
          allowEmpty: false,
          endpoint: '/v1/retrieval/search',
          verbose: false,
          caseCount: 1,
          scenarioIds: ['scenario-1'],
        },
      },
    });

    await adapter.publish({
      family: 'EvalRunFinished',
      suite: 'retrieval',
      tier: 'smoke',
      runId: 'run-archive',
      caseId: null,
      scenarioId: null,
      timestamp: '2026-07-03T00:00:01.000Z',
      tags: ['dry-run'],
      payload: {
        reportMeta: {
          schemaVersion: 1,
          timestamp: '2026-07-03T00:00:00.000Z',
          durationMs: 1000,
          options: {
            tier: 'smoke',
            dryRun: true,
            allowEmpty: false,
            verbose: 0,
          },
        },
        reportSummary: {
          totalCases: 4,
          passedCases: 4,
          failedCases: 0,
          passRate: 1,
          passed: true,
        },
        reportCollections: {
          cases: [],
          slices: [],
          failures: [],
          warnings: [],
        },
      },
    });

    const archive = JSON.parse(readFileSync(join(outputDir, 'run-archive.json'), 'utf8')) as {
      events: Array<{ family: string }>;
    };

    expect(archive.events.map((event) => event.family)).toEqual([
      'EvalRunStarted',
      'EvalRunFinished',
    ]);
  });
});
