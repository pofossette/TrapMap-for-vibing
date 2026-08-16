import { vi } from 'vitest';
import type { HostLocalRuntime } from '../host-runtime.js';

/**
 * Minimal fake runtime sufficient to boot the four host nodes + a fake
 * transport (no service factories are exercised). The store pool and close
 * are the only runtime surfaces the pilot host nodes read.
 */
export function createFakeHostRuntime(): HostLocalRuntime {
  const pool = { query: vi.fn(async () => ({ rows: [] })) };
  return {
    services: {
      config: { databaseUrl: 'postgresql://x@y/z' },
      store: {
        getPool: () => pool,
        close: vi.fn(async () => undefined),
      },
      close: vi.fn(async () => undefined),
    },
  } as unknown as HostLocalRuntime; // lib type gap: minimal test fixture bridges the large HostLocalRuntime shape
}

/**
 * Minimal runtime for profile build()/startup-checks assertions (build does
 * not run node apply, so only a structural shell is needed).
 */
export function createBuildRuntime(): HostLocalRuntime {
  return {} as unknown as HostLocalRuntime; // lib type gap: build() does not touch the runtime shape
}
