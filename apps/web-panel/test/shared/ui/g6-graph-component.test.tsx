import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { G6GraphComponent } from '../../../src/shared/ui/g6-graph-component';

const { graphConstructor } = vi.hoisted(() => ({
  graphConstructor: vi.fn(),
}));

vi.mock('@antv/g6', () => ({
  Graph: graphConstructor,
}));

type FakeGraphRecord = {
  handlers: Record<string, (event: any) => void>;
  destroy: ReturnType<typeof vi.fn>;
  render: ReturnType<typeof vi.fn>;
  draw: ReturnType<typeof vi.fn>;
  updateNodeData: ReturnType<typeof vi.fn>;
  getNodeData: ReturnType<typeof vi.fn>;
  getEdgeData: ReturnType<typeof vi.fn>;
  focusElement: ReturnType<typeof vi.fn>;
};

let latestGraph: FakeGraphRecord | null = null;

class FakeGraph {
  handlers: Record<string, (event: any) => void> = {};
  destroy = vi.fn();
  render = vi.fn(() => Promise.resolve());
  draw = vi.fn(() => Promise.resolve());
  updateNodeData = vi.fn();
  getNodeData = vi.fn(() => []);
  getEdgeData = vi.fn();
  focusElement = vi.fn(() => Promise.resolve());

  constructor() {
    latestGraph = this;
  }

  on(eventName: string, handler: (event: any) => void) {
    this.handlers[eventName] = handler;
  }
}

// @ts-ignore
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('G6GraphComponent drag behavior', () => {
  beforeEach(() => {
    latestGraph = null;
    document.body.innerHTML = '';
    graphConstructor.mockReset();
    graphConstructor.mockImplementation(() => new FakeGraph());
  });

  it('renders with layout-enabled initialization and force drag behavior', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <G6GraphComponent
          data={{
            nodes: [{ id: 'node-1', label: 'Node 1', kind: 'trap' }],
            edges: [],
          }}
          onSelectEdge={() => {}}
          onSelectNode={() => {}}
        />,
      );
    });

    expect(latestGraph).not.toBeNull();
    expect(graphConstructor).toHaveBeenCalledTimes(1);
    const graphOptions = graphConstructor.mock.calls[0]?.[0];
    expect(graphOptions.behaviors).toEqual(
      expect.arrayContaining([
        'drag-canvas',
        'zoom-canvas',
        expect.objectContaining({
          type: 'drag-element-force',
          fixed: true,
        }),
      ]),
    );
    expect(graphOptions.layout).toEqual(
      expect.objectContaining({
        type: 'd3-force',
        link: expect.objectContaining({
          distance: 120,
        }),
        collide: expect.objectContaining({
          radius: 42,
        }),
      }),
    );
    expect(latestGraph?.render).toHaveBeenCalledTimes(1);
    expect(latestGraph?.handlers['node:dragstart']).toBeUndefined();
    expect(latestGraph?.handlers['node:drag']).toBeUndefined();
    expect(latestGraph?.handlers['node:dragend']).toBeUndefined();

    await act(async () => {
      root.unmount();
    });
    document.body.removeChild(container);
  });
});
