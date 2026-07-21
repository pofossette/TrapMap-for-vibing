import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(process.cwd(), 'packages/server/src/lib');

describe('service boundary guard', () => {
  it('lifecycle bootstrap does not inspect compatibility store state', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'packages/server/src/bootstrap/bootstrap-lifecycle.ts'),
      'utf8',
    );

    expect(source).not.toContain('store.snapshot(');
    expect(source).not.toContain('createTaskQueue(');
    expect(source).not.toContain('createDomainEventOutbox(');
  });

  it('receives async transport from host composition instead of constructing it', () => {
    const source = readFileSync(resolve(process.cwd(), 'packages/server/src/app.ts'), 'utf8');

    expect(source).not.toContain("from './lib/async/factory.js'");
    expect(source).not.toContain('createAsyncTransport(');
  });
});
