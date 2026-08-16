import { describe, expect, it } from 'vitest';

import { defineNode } from '../define-node.js';
import { composeEmbeddedPilot } from './scaffold.js';

const infraNodes = [
  defineNode({ id: 'config', provides: 'config', apply: (ctx) => ctx.provide('config', {}) }),
  defineNode({
    id: 'runtime',
    provides: 'runtime',
    inject: ['config'],
    apply: (ctx) => ctx.provide('runtime', { value: 'runtime' }),
  }),
];

const serviceNodes = [
  defineNode({
    id: 'knowledge',
    provides: 'knowledge',
    inject: ['runtime'],
    apply: (ctx) => ctx.provide('knowledge', { value: 'knowledge' }),
  }),
];

const fakeTransport = defineNode({
  id: 'fake-transport',
  provides: 'httpSurface',
  inject: ['runtime', 'knowledge'],
  apply: (ctx) => {
    ctx.provide('httpSurface', { fake: true });
    return () => undefined;
  },
});

describe('composeEmbeddedPilot (assembly-zone profiles scaffold)', () => {
  it('builds without startup issues and preserves D3 embedded order', () => {
    const builder = composeEmbeddedPilot({
      infraNodes,
      serviceNodes,
      transportNode: fakeTransport,
    });
    const assembly = builder.build();
    // build() runs startup checks (duplicate ids / unknown injects / cycles).
    expect(assembly.nodes.map((n) => n.id)).toEqual([
      'config',
      'runtime',
      'knowledge',
      'fake-transport',
    ]);
  });

  it('registers the pilot node ids with resolvable injects under startup checks', () => {
    const assembly = composeEmbeddedPilot({
      infraNodes,
      serviceNodes,
      transportNode: fakeTransport,
    }).build();
    const byId = new Map(assembly.nodes.map((n) => [n.id, n]));
    expect(byId.get('runtime')?.inject).toEqual(['config']);
    expect(byId.get('knowledge')?.inject).toEqual(['runtime']);
    expect(byId.get('fake-transport')?.inject).toEqual(['runtime', 'knowledge']);
  });
});
