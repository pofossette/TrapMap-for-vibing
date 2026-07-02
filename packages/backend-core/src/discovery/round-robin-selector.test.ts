import { describe, expect, it } from 'vitest';

import type { DiscoveredService } from '../ports/discovery-ports.js';
import { RoundRobinSelector } from './round-robin-selector.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeInstances(n: number): DiscoveredService[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `svc-${i}`,
    address: `10.0.0.${i + 1}`,
    port: 8080 + i,
  }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RoundRobinSelector', () => {
  it('cycles through instances in order', () => {
    const selector = new RoundRobinSelector();
    const instances = makeInstances(3);

    const first = selector.select('auth', instances);
    const second = selector.select('auth', instances);
    const third = selector.select('auth', instances);
    const fourth = selector.select('auth', instances); // wraps around

    expect(first?.id).toBe('svc-0');
    expect(second?.id).toBe('svc-1');
    expect(third?.id).toBe('svc-2');
    expect(fourth?.id).toBe('svc-0');
  });

  it('returns the single instance repeatedly', () => {
    const selector = new RoundRobinSelector();
    const instances = makeInstances(1);

    expect(selector.select('auth', instances)?.id).toBe('svc-0');
    expect(selector.select('auth', instances)?.id).toBe('svc-0');
  });

  it('returns undefined when the list is empty', () => {
    const selector = new RoundRobinSelector();
    expect(selector.select('auth', [])).toBeUndefined();
  });

  it('skips unhealthy instances', () => {
    const selector = new RoundRobinSelector();
    const instances = makeInstances(3);
    const unhealthy = new Set(['svc-1']);

    const first = selector.select('auth', instances, unhealthy);
    const second = selector.select('auth', instances, unhealthy);

    expect(first?.id).toBe('svc-0');
    expect(second?.id).toBe('svc-2');
  });

  it('returns undefined when all instances are unhealthy', () => {
    const selector = new RoundRobinSelector();
    const instances = makeInstances(2);
    const unhealthy = new Set(['svc-0', 'svc-1']);

    expect(selector.select('auth', instances, unhealthy)).toBeUndefined();
  });

  it('tracks indices independently per service name', () => {
    const selector = new RoundRobinSelector();
    const authInstances = makeInstances(2); // svc-0, svc-1
    const billingInstances = makeInstances(2); // svc-0, svc-1

    expect(selector.select('auth', authInstances)?.id).toBe('svc-0');
    expect(selector.select('billing', billingInstances)?.id).toBe('svc-0');
    expect(selector.select('auth', authInstances)?.id).toBe('svc-1');
    expect(selector.select('billing', billingInstances)?.id).toBe('svc-1');
  });
});
