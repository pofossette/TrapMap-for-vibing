import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAssembly } from '@trapmap/assembly';

import {
  hostLocalConfigNode,
  hostLocalPgNode,
  hostLocalRuntimeNode,
  hostLocalServicesNode,
} from '../../../../../src/nest/runtime/assembly/nodes/host-nodes.js';
import { createFakeHostRuntime } from '../../../../../src/nest/runtime/assembly/test-fixtures.js';

const originalDatabaseUrl = process.env.TRAPMAP_DATABASE_URL;

afterEach(() => {
  if (originalDatabaseUrl === undefined) {
    process.env.TRAPMAP_DATABASE_URL = '';
  } else {
    process.env.TRAPMAP_DATABASE_URL = originalDatabaseUrl;
  }
  vi.restoreAllMocks();
});

describe('host-local assembly pilot host nodes', () => {
  it('are embedded with expected ids/provides/injects', () => {
    expect(hostLocalConfigNode.id).toBe('host-local-config');
    expect(hostLocalConfigNode.provides).toBe('hostLocalConfig');
    expect(hostLocalConfigNode.topology).toBe('embedded');

    expect(hostLocalServicesNode.id).toBe('host-local-services');
    expect(hostLocalServicesNode.provides).toBe('hostLocalServices');
    expect(hostLocalServicesNode.inject).toEqual(['hostLocalConfig']);

    expect(hostLocalPgNode.id).toBe('host-local-pg');
    expect(hostLocalPgNode.provides).toBe('pg');
    expect(hostLocalPgNode.inject).toEqual(['hostLocalServices']);

    expect(hostLocalRuntimeNode.id).toBe('host-local-runtime');
    expect(hostLocalRuntimeNode.provides).toBe('hostLocalRuntime');
    expect(hostLocalRuntimeNode.inject).toEqual(['hostLocalServices']);
  });

  it('build() passes startup checks when all pilot host nodes are composed', () => {
    const runtime = createFakeHostRuntime();
    const builder = createAssembly()
      .add(hostLocalConfigNode, { runtime })
      .add(hostLocalServicesNode, { runtime })
      .add(hostLocalPgNode, { runtime })
      .add(hostLocalRuntimeNode, { runtime });
    expect(() => builder.build()).not.toThrow();
  });

  it('boots the synchronous host chain and disposes the store once', async () => {
    const runtime = createFakeHostRuntime();
    const closeSpy = vi.spyOn(runtime.services, 'close');

    const running = await createAssembly()
      .add(hostLocalConfigNode, { runtime })
      .add(hostLocalServicesNode, { runtime })
      .add(hostLocalPgNode, { runtime })
      .add(hostLocalRuntimeNode, { runtime })
      .build()
      .boot();

    expect(running.ctx.get('hostLocalConfig')).toBeTruthy();
    expect(running.ctx.get('hostLocalServices')).toBe(runtime.services);
    expect(running.ctx.get('pg')).toBeTruthy();
    expect(running.ctx.get('hostLocalRuntime')).toBe(runtime);

    await running.dispose();
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });
});
