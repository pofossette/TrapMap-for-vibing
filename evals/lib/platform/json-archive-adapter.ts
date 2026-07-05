import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  type EvalPlatformEvent,
  evalPlatformEventSchema,
  evalPlatformRunSchema,
} from '../../../packages/contracts/src/domain/evals/platform.js';

import type { EvalPlatformAdapter, EvalPlatformAdapterConfig } from './types.js';

interface RunArchiveState {
  suite: string;
  tier: 'smoke' | 'core';
  tags: Set<string>;
  events: EvalPlatformEvent[];
}

function writeArchive(outputDir: string, runId: string, state: RunArchiveState): void {
  const archive = evalPlatformRunSchema.parse({
    runId,
    suite: state.suite,
    tier: state.tier,
    startedAt: state.events[0]?.timestamp,
    finishedAt:
      state.events.at(-1)?.family === 'EvalRunFinished'
        ? state.events.at(-1)?.timestamp
        : undefined,
    tags: [...state.tags],
    events: state.events,
  });

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(join(outputDir, `${runId}.json`), JSON.stringify(archive, null, 2));
}

export function createJsonArchiveAdapter(
  config: Pick<EvalPlatformAdapterConfig, 'outputDir'> = {},
): EvalPlatformAdapter {
  const outputDir = resolve(config.outputDir ?? 'reports/platform-events');
  const runs = new Map<string, RunArchiveState>();

  return {
    kind: 'json-archive',
    async publish(eventInput) {
      const event = evalPlatformEventSchema.parse(eventInput);
      const existing = runs.get(event.runId);
      const state: RunArchiveState = existing ?? {
        suite: event.suite,
        tier: event.tier,
        tags: new Set<string>(),
        events: [],
      };

      state.events.push(event);
      for (const tag of event.tags) {
        state.tags.add(tag);
      }
      runs.set(event.runId, state);
      writeArchive(outputDir, event.runId, state);
    },
    async close() {},
  };
}
