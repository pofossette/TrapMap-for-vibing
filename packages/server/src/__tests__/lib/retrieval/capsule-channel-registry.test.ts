import {
  CapsuleChannelRegistry,
  capsuleHeuristicChannel,
} from '@trapmap/server/lib/retrieval/capsules/index.js';
import type {
  CapsuleRecallChannel,
  CapsuleRecallChannelName,
} from '@trapmap/server/lib/retrieval/types.js';
import { beforeEach, describe, expect, it } from 'vitest';

describe('CapsuleChannelRegistry', () => {
  let registry: CapsuleChannelRegistry;

  beforeEach(() => {
    registry = new CapsuleChannelRegistry();
  });

  it('should register a channel successfully', () => {
    const channel: CapsuleRecallChannel = {
      name: 'capsule-heuristic' as CapsuleRecallChannelName,
      async recall() {
        return [];
      },
    };

    expect(() => registry.register(channel)).not.toThrow();
    expect(registry.get('capsule-heuristic')).toBe(channel);
  });

  it('should throw on duplicate channel registration', () => {
    const channel: CapsuleRecallChannel = {
      name: 'capsule-heuristic' as CapsuleRecallChannelName,
      async recall() {
        return [];
      },
    };

    registry.register(channel);
    expect(() => registry.register(channel)).toThrow(
      "Capsule recall channel 'capsule-heuristic' is already registered",
    );
  });

  it('should return undefined for unregistered channel', () => {
    expect(registry.get('nonexistent')).toBeUndefined();
  });

  it('should return all registered channels in registration order', () => {
    const channel1: CapsuleRecallChannel = {
      name: 'capsule-heuristic' as CapsuleRecallChannelName,
      async recall() {
        return [];
      },
    };
    const channel2: CapsuleRecallChannel = {
      name: 'capsule-keyword' as CapsuleRecallChannelName,
      async recall() {
        return [];
      },
    };

    registry.register(channel1);
    registry.register(channel2);

    const all = registry.all();
    expect(all).toHaveLength(2);
    expect(all[0]!.name).toBe('capsule-heuristic');
    expect(all[1]!.name).toBe('capsule-keyword');
  });

  it('should unregister a channel', () => {
    const channel: CapsuleRecallChannel = {
      name: 'capsule-heuristic' as CapsuleRecallChannelName,
      async recall() {
        return [];
      },
    };

    registry.register(channel);
    expect(registry.get('capsule-heuristic')).toBe(channel);

    registry.unregister('capsule-heuristic');
    expect(registry.get('capsule-heuristic')).toBeUndefined();
  });

  it('should not throw when unregistering a nonexistent channel', () => {
    expect(() => registry.unregister('nonexistent')).not.toThrow();
  });

  it('should allow re-registration after unregistering', () => {
    const channel: CapsuleRecallChannel = {
      name: 'capsule-heuristic' as CapsuleRecallChannelName,
      async recall() {
        return [];
      },
    };

    registry.register(channel);
    registry.unregister('capsule-heuristic');

    expect(() => registry.register(channel)).not.toThrow();
    expect(registry.get('capsule-heuristic')).toBe(channel);
  });
});
