import { describe, expect, it, vi } from 'vitest';
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

  it('forwards assembly shutdownTimeoutMs to the controller when per-call timeout is absent', async () => {
    const warnings: string[] = [];
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation((message: unknown) => {
      warnings.push(String(message));
    });
    try {
      const hanging = defineNode({
        id: 'a',
        apply: () => async (): Promise<void> => {
          await new Promise<void>(() => {});
        },
      });
      const running = await createAssembly({ shutdownTimeoutMs: 20 }).add(hanging).build().boot();
      const controller = running.createShutdownController();
      await controller.shutdown();
      expect(controller.state).toBe('done');
      expect(warnings.some((message) => message.includes('within 20ms'))).toBe(true);
    } finally {
      warnSpy.mockRestore();
    }
  }, 10000);

  it('prefers per-call timeoutMs over assembly shutdownTimeoutMs', async () => {
    const hanging = defineNode({
      id: 'a',
      apply: () => async (): Promise<void> => {
        await new Promise<void>(() => {});
      },
    });
    const running = await createAssembly({ shutdownTimeoutMs: 60_000 }).add(hanging).build().boot();
    const controller = running.createShutdownController({ timeoutMs: 20 });
    await controller.shutdown();
    expect(controller.state).toBe('done');
  }, 10000);

  it('defaults shutdown timeout to 5000ms when neither assembly nor controller options specify it', async () => {
    vi.useFakeTimers();
    const warnings: string[] = [];
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation((message: unknown) => {
      warnings.push(String(message));
    });
    try {
      const hanging = defineNode({
        id: 'a',
        apply: () => async (): Promise<void> => {
          await new Promise<void>(() => {});
        },
      });
      const running = await createAssembly().add(hanging).build().boot();
      const controller = running.createShutdownController();
      const pending = controller.shutdown();
      await vi.advanceTimersByTimeAsync(5000);
      await pending;
      expect(controller.state).toBe('done');
      expect(warnings.some((message) => message.includes('within 5000ms'))).toBe(true);
    } finally {
      warnSpy.mockRestore();
      vi.useRealTimers();
    }
  });
});
