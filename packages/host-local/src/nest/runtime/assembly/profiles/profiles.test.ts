import { describe, expect, it } from 'vitest';

import { createBuildRuntime } from '../test-fixtures.js';
import { localAgentAssembly } from './local-agent.js';
import { teamMonolithAssembly } from './team-monolith.js';

const PILOT_NODE_IDS = [
  'host-local-config',
  'host-local-services',
  'host-local-pg',
  'host-local-runtime',
  'identity-access',
  'knowledge-read',
  'knowledge-write',
  'job-runtime',
  'governance-review',
  'candidate-ingestion',
  'cron',
  'intent-recognition',
  'dedup-strategy',
  'conflict-trigger',
  'artifact-derivation',
  'label-alignment',
  'channel-merge',
  'nest-transport',
] as const;

describe('host-local assembly profiles', () => {
  it.each([
    ['localAgentAssembly', () => localAgentAssembly({ runtime: createBuildRuntime() })],
    ['teamMonolithAssembly', () => teamMonolithAssembly({ runtime: createBuildRuntime() })],
  ] as const)(
    '%s.build() passes startup checks and exposes the D2 pilot node set',
    (_name, build) => {
      const assembly = build().build();
      const ids = assembly.nodes.map((n) => n.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of PILOT_NODE_IDS) {
        expect(ids).toContain(id);
      }
    },
  );
});
