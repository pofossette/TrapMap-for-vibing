import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createAssembly } from '../src/create-assembly.js';
import { defineNode } from '../src/define-node.js';
import type { ContractDescriptor } from '../src/types.js';
import { AssemblyStartupError } from '../src/types.js';

const noop = (): void => {};

describe('createAssembly', () => {
  it('boots nodes in inject order and lets dependents read provided services', async () => {
    const order: string[] = [];

    const nodeA = defineNode({
      id: 'a',
      provides: ['svcA'],
      apply: (ctx) => {
        order.push('a');
        ctx.provide('svcA', { value: 'from-a' });
      },
    });
    const nodeB = defineNode({
      id: 'b',
      inject: ['svcA'],
      apply: (ctx) => {
        const svc = ctx.get('svcA') as { value: string } | undefined;
        order.push(`b:${svc?.value}`);
      },
    });

    const running = await createAssembly().add(nodeA).add(nodeB).build().boot();
    expect(order).toEqual(['a', 'b:from-a']);

    await running.dispose();
  });

  it('passes the (config schema) validated config to apply', async () => {
    let received: unknown;
    const nodeA = defineNode({
      id: 'a',
      configSchema: z.object({ name: z.string(), n: z.number().default(1) }),
      apply: (ctx, config) => {
        void ctx;
        received = config;
      },
    });

    const running = await createAssembly().add(nodeA, { name: 'hello' }).build().boot();
    expect(received).toEqual({ name: 'hello', n: 1 });

    await running.dispose();
  });

  it('rejects boot when a node config fails its config schema', async () => {
    const nodeA = defineNode({
      id: 'a',
      configSchema: z.object({ name: z.string() }),
      apply: noop,
    });

    await expect(createAssembly().add(nodeA, { name: 123 }).build().boot()).rejects.toThrow();
  });

  it('runs a disposer returned from apply on dispose', async () => {
    let disposed = false;
    const nodeA = defineNode({
      id: 'a',
      apply: () => () => {
        disposed = true;
      },
    });

    const running = await createAssembly().add(nodeA).build().boot();
    expect(disposed).toBe(false);
    await running.dispose();
    expect(disposed).toBe(true);
  });

  it('disposes fibers in reverse registration order', async () => {
    const order: string[] = [];
    const nodeA = defineNode({
      id: 'a',
      apply: () => () => {
        order.push('a');
      },
    });
    const nodeB = defineNode({
      id: 'b',
      apply: () => () => {
        order.push('b');
      },
    });

    const running = await createAssembly().add(nodeA).add(nodeB).build().boot();
    await running.dispose();
    expect(order).toEqual(['b', 'a']);
  });

  it('rejects boot when a node apply throws', async () => {
    const nodeA = defineNode({
      id: 'a',
      apply: () => {
        throw new Error('explode');
      },
    });

    await expect(createAssembly().add(nodeA).build().boot()).rejects.toThrow('explode');
  });

  it('throws immediately on duplicate .add', () => {
    const nodeA = defineNode({ id: 'a', apply: noop });
    const builder = createAssembly().add(nodeA);
    expect(() => builder.add(nodeA)).toThrow(/duplicate node id "a"/);
  });

  it('accepts a node implementing a registered contract satisfied by verify', () => {
    const contract: ContractDescriptor = {
      id: 'intent',
      verify: (candidate) =>
        candidate.provides?.includes('intentRecognition')
          ? []
          : ['node must provide intentRecognition'],
    };
    const nodeA = defineNode({
      id: 'a',
      contract: 'intent',
      provides: ['intentRecognition'],
      apply: noop,
    });

    expect(() =>
      createAssembly({ contracts: [contract] })
        .add(nodeA)
        .build(),
    ).not.toThrow();
  });

  it('throws AssemblyStartupError listing issues when a referenced contract is missing', () => {
    const nodeA = defineNode({ id: 'a', contract: 'ghost', apply: noop });

    expect(() => createAssembly().add(nodeA).build()).toThrow(AssemblyStartupError);
  });

  it('exposes a bounded shutdown controller on the running assembly', async () => {
    const nodeA = defineNode({ id: 'a', apply: noop });
    const running = await createAssembly().add(nodeA).build().boot();
    const controller = running.createShutdownController({ timeoutMs: 100 });
    expect(controller.state).toBe('idle');
    await controller.shutdown();
    expect(controller.state).toBe('done');
  });
});
