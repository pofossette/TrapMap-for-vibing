import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { publishPlatformEventSafely } from './adapter.js';
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
        suite: 'all',
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
          },
          runScope: {
            tier: 'smoke',
            dryRun: true,
          },
        },
      }),
    ).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('broken'),
      expect.objectContaining({ message: 'archive unavailable' }),
    );
  });

  it('archives mirrored platform events under reports-compatible output', async () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'trapmap-platform-'));
    const adapter = createJsonArchiveAdapter({ outputDir });

    await adapter.publish({
      family: 'EvalRunStarted',
      suite: 'all',
      tier: 'smoke',
      runId: 'run-archive',
      caseId: null,
      scenarioId: null,
      timestamp: '2026-07-03T00:00:00.000Z',
      tags: ['aggregate'],
      payload: {
        reportMeta: {
          schemaVersion: 1,
          timestamp: '2026-07-03T00:00:00.000Z',
        },
        runScope: {
          tier: 'smoke',
          dryRun: true,
        },
      },
    });

    await adapter.publish({
      family: 'EvalRunFinished',
      suite: 'all',
      tier: 'smoke',
      runId: 'run-archive',
      caseId: null,
      scenarioId: null,
      timestamp: '2026-07-03T00:00:01.000Z',
      tags: ['aggregate'],
      payload: {
        reportMeta: {
          schemaVersion: 1,
          timestamp: '2026-07-03T00:00:00.000Z',
          durationMs: 1000,
        },
        reportSummary: {
          passed: true,
          totalCases: 4,
        },
        reportCollections: {
          retrieval: null,
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
