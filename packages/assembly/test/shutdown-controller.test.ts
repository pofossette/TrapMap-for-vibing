import { describe, expect, it } from 'vitest';

import { createShutdownController } from '../src/shutdown-controller.js';

const nextTick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function abortSignalFixture(preAborted: boolean): {
  controller: AbortController;
  shutdown: ReturnType<typeof createShutdownController>;
  isDisposed: () => boolean;
} {
  const controller = new AbortController();
  if (preAborted) controller.abort();
  let disposed = false;
  const shutdown = createShutdownController(
    () => {
      disposed = true;
    },
    { signal: controller.signal },
  );
  return { controller, shutdown, isDisposed: () => disposed };
}

describe('createShutdownController', () => {
  it('is idempotent: dispose runs once and state ends at done', async () => {
    let disposeCalls = 0;
    const controller = createShutdownController(() => {
      disposeCalls += 1;
    });

    await controller.shutdown();
    await controller.shutdown();
    expect(disposeCalls).toBe(1);
    expect(controller.state).toBe('done');
    expect(controller.done).toBe(true);
  });

  it('shares one promise across concurrent shutdown calls', async () => {
    let resolveDispose!: () => void;
    const disposePromise = new Promise<void>((resolve) => {
      resolveDispose = resolve;
    });
    const controller = createShutdownController(() => disposePromise);

    const first = controller.shutdown();
    const second = controller.shutdown();
    expect(controller.state).toBe('shutting-down');

    resolveDispose();
    await first;
    await second;
    expect(controller.state).toBe('done');
  });

  it('transitions idle -> shutting-down -> done', async () => {
    let resolveDispose!: () => void;
    const gate = new Promise<void>((resolve) => {
      resolveDispose = resolve;
    });
    const controller = createShutdownController(() => gate);

    expect(controller.state).toBe('idle');
    const pending = controller.shutdown();
    expect(controller.state).toBe('shutting-down');
    resolveDispose();
    await pending;
    expect(controller.state).toBe('done');
  });

  it('resolves anyway when dispose never settles (bounded timeout)', async () => {
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (message: unknown) => {
      warnings.push(String(message));
    };
    try {
      const controller = createShutdownController(() => new Promise<void>(() => {}), {
        timeoutMs: 20,
      });
      await controller.shutdown();
      expect(controller.state).toBe('done');
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0] ?? '').toContain('did not settle');
    } finally {
      console.warn = originalWarn;
    }
  });

  it('invokes onShutdown callbacks once after completion', async () => {
    const calls: string[] = [];
    const controller = createShutdownController(() => undefined);
    controller.onShutdown(() => calls.push('first'));
    controller.onShutdown(() => calls.push('second'));

    await controller.shutdown();
    expect(calls).toEqual(['first', 'second']);

    // callbacks already run are not duplicated on a later shutdown
    controller.onShutdown(() => calls.push('late'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toEqual(['first', 'second', 'late']);
  });

  it('triggers shutdown when the wired abort signal aborts', async () => {
    const fixture = abortSignalFixture(false);
    fixture.controller.abort();
    expect(fixture.shutdown.state).toBe('shutting-down');
    await nextTick();
    expect(fixture.isDisposed()).toBe(true);
    expect(fixture.shutdown.state).toBe('done');
  });

  it('triggers shutdown immediately when the signal is already aborted', async () => {
    const fixture = abortSignalFixture(true);
    await nextTick();
    expect(fixture.isDisposed()).toBe(true);
    expect(fixture.shutdown.state).toBe('done');
  });

  it('forwards dispose errors to onError without rejecting shutdown', async () => {
    const seen: unknown[] = [];
    const shutdown = createShutdownController(
      () => {
        throw new Error('teardown failed');
      },
      { onError: (err) => seen.push(err) },
    );
    await shutdown.shutdown();
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBeInstanceOf(Error);
    expect(shutdown.state).toBe('done');
  });
});
