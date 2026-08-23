import { describe, expect, it } from 'vitest';

import type { G6Edge, G6Node } from '@trapmap/web-panel/shared/enum-types';
import { type TrapNodeFilterState, applyTrapGraphView } from './trap-graph-view';

const nodes: G6Node[] = [
  { id: 'trap', label: 'Trap', kind: 'trap' },
  { id: 'cue', label: 'Cue', kind: 'cue' },
  { id: 'tool', label: 'Tool', kind: 'tool' },
  { id: 'environment', label: 'Environment', kind: 'environment' },
  { id: 'distant', label: 'Distant', kind: 'mitigation' },
  { id: 'isolated', label: 'Isolated', kind: 'mitigation' },
];

const edges: G6Edge[] = [
  { id: 'trap-cue', source: 'trap', target: 'cue' },
  { id: 'trap-tool', source: 'trap', target: 'tool' },
  { id: 'tool-environment', source: 'tool', target: 'environment' },
  { id: 'environment-distant', source: 'environment', target: 'distant' },
];

const allLayersEnabled: TrapNodeFilterState = {
  cue: true,
  environment: true,
  mitigation: true,
  tool: true,
  trap: true,
};

describe('applyTrapGraphView', () => {
  it('returns the complete filtered graph when no node is selected', () => {
    const view = applyTrapGraphView(
      { nodes, edges },
      { ...allLayersEnabled, cue: false },
      'all',
      null,
    );

    expect(view.nodes.map((node) => node.id).sort()).toEqual([
      'distant',
      'environment',
      'isolated',
      'tool',
      'trap',
    ]);
    expect(view.edges.map((edge) => edge.id)).toEqual([
      'trap-tool',
      'tool-environment',
      'environment-distant',
    ]);
  });

  it('includes one undirected hop around the selected root', () => {
    const view = applyTrapGraphView({ nodes, edges }, allLayersEnabled, '1', 'trap');

    expect(view.nodes.map((node) => node.id).sort()).toEqual(['cue', 'tool', 'trap']);
    expect(view.edges.map((edge) => edge.id).sort()).toEqual(['trap-cue', 'trap-tool']);
  });

  it('expands two hops through intermediate nodes only', () => {
    const view = applyTrapGraphView({ nodes, edges }, allLayersEnabled, '2', 'trap');

    expect(view.nodes.map((node) => node.id).sort()).toEqual([
      'cue',
      'environment',
      'tool',
      'trap',
    ]);
    expect(view.edges.map((edge) => edge.id).sort()).toEqual([
      'tool-environment',
      'trap-cue',
      'trap-tool',
    ]);
  });

  it('keeps the connected component and induced edges at unlimited depth', () => {
    const view = applyTrapGraphView({ nodes, edges }, allLayersEnabled, 'all', 'trap');

    expect(view.nodes.map((node) => node.id).sort()).toEqual([
      'cue',
      'distant',
      'environment',
      'tool',
      'trap',
    ]);
    expect(view.edges.map((edge) => edge.id).sort()).toEqual([
      'environment-distant',
      'tool-environment',
      'trap-cue',
      'trap-tool',
    ]);
  });

  it('applies layer filters before neighborhood traversal', () => {
    const view = applyTrapGraphView(
      { nodes, edges },
      { ...allLayersEnabled, tool: false },
      '2',
      'trap',
    );

    expect(view.nodes.map((node) => node.id)).toEqual(['trap', 'cue']);
    expect(view.edges.map((edge) => edge.id)).toEqual(['trap-cue']);
  });
});
