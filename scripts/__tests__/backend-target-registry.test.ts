import { describe, expect, it } from 'vitest';
import {
  BACKEND_TARGET_REGISTRY,
  resolveDevTargetFromRegistry,
  verifyBackendTargetProfileOwnership,
} from '../backend-target-registry';

describe('backend target registry', () => {
  it('describes light and heavy target ownership and client defaults', () => {
    expect(BACKEND_TARGET_REGISTRY.light).toMatchObject({
      profiles: ['local-agent', 'team-monolith'],
      hostPackage: '@trapmap/host-local',
      clientDefault: true,
    });
    expect(BACKEND_TARGET_REGISTRY.heavy).toMatchObject({
      profiles: ['distributed'],
      hostPackage: '@trapmap/host-distributed',
      clientDefault: false,
    });
  });

  it('provides build and verification commands for every target', () => {
    for (const target of Object.values(BACKEND_TARGET_REGISTRY)) {
      expect(target.buildCommand.length).toBeGreaterThan(0);
      expect(target.verificationCommands.length).toBeGreaterThan(0);
    }
  });

  it('rejects profile ownership that drifts from the contracts mapping', () => {
    const registryWithDrift = {
      ...BACKEND_TARGET_REGISTRY,
      light: {
        ...BACKEND_TARGET_REGISTRY.light,
        profiles: ['distributed'],
      },
      heavy: {
        ...BACKEND_TARGET_REGISTRY.heavy,
        profiles: ['local-agent', 'team-monolith'],
      },
    };

    expect(() => verifyBackendTargetProfileOwnership(registryWithDrift)).toThrow(
      'Backend target profile ownership drift',
    );
  });

  it('resolves standard and distributed compatibility dev targets', () => {
    expect(resolveDevTargetFromRegistry('local-agent')).toMatchObject({
      env: { TRAPMAP_DEPLOYMENT_PROFILE: 'local-agent' },
      packageName: '@trapmap/host-local',
      scriptName: 'dev',
    });
    expect(resolveDevTargetFromRegistry('candidate-worker')).toMatchObject({
      packageName: '@trapmap/host-distributed',
      scriptName: 'dev:candidate-ingestion',
    });
    expect(resolveDevTargetFromRegistry('distributed:gateway')).toMatchObject({
      packageName: '@trapmap/host-distributed',
      scriptName: 'dev:gateway',
    });
  });
});
