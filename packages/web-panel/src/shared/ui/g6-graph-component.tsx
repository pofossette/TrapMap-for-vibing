import { Graph } from '@antv/g6';
import { type ReactElement, useEffect, useRef } from 'react';

interface G6GraphComponentProps {
  data: {
    nodes: Array<{
      id: string;
      label: string;
      kind: string;
      [key: string]: any;
    }>;
    edges: Array<{
      id: string;
      source: string;
      target: string;
      label?: string;
      kind?: string;
      [key: string]: any;
    }>;
  };
  onSelectNode: (node: any) => void;
  onSelectEdge: (edge: any) => void;
  searchKeyword?: string;
  highlightColor?: string;
}

function getNodeStrokeColor(kind?: string): string {
  if (kind === 'trap') return '#f97316';
  if (kind === 'artifact') return '#006fee';
  if (kind === 'capsule') return '#22c55e';
  if (kind === 'profile') return '#a855f7';
  if (kind === 'cue') return '#eab308';
  if (kind === 'tool') return '#7dd3fc';
  if (kind === 'mitigation') return '#10b981';
  return '#242424';
}

export function G6GraphComponent({
  data,
  onSelectNode,
  onSelectEdge,
  searchKeyword = '',
  highlightColor = '#006fee',
}: G6GraphComponentProps): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<Graph | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const width = containerRef.current.clientWidth || 600;
    const height = containerRef.current.clientHeight || 500;

    const formattedData = {
      nodes: data.nodes.map((node) => {
        const kind = node.kind || node.type || 'unknown';
        return {
          ...node,
          style: {
            ...node.style,
            fill: '#0a0f1d',
            stroke: getNodeStrokeColor(kind),
          },
        };
      }),
      edges: data.edges,
    };

    const graph = new Graph({
      container: containerRef.current,
      width,
      height,
      autoResize: true,
      data: formattedData,
      padding: 20,
      autoFit: 'view',
      behaviors: [
        'drag-canvas',
        'zoom-canvas',
        {
          type: 'drag-element-force',
          fixed: true,
        },
        {
          type: 'click-select',
          degree: 1,
          animation: false,
          state: 'selected',
          neighborState: 'neighbor',
          unselectedState: 'dimmed',
          onClick: (event: any) => {
            const targetId = event.target?.id;
            if (!targetId) return;

            if (event.targetType === 'node') {
              onSelectNode(graph.getNodeData(targetId));
              return;
            }

            if (event.targetType === 'edge') {
              onSelectEdge(graph.getEdgeData(targetId));
            }
          },
        },
      ],
      layout: {
        type: 'd3-force',
        link: {
          distance: 120,
          strength: 1.5,
        },
        collide: {
          radius: 42,
        },
      },
      node: {
        type: 'circle',
        style: {
          size: 42,
          lineWidth: 1.5,
          cursor: 'pointer',
          label: true,
          labelPlacement: 'bottom',
          labelText: (datum: any) => datum.label,
          labelFill: '#ffffff',
          labelFontSize: 11,
          labelFontFamily: 'Inter',
        },
        state: {
          selected: {
            lineWidth: 3.5,
            stroke: highlightColor,
            opacity: 1,
          },
          neighbor: {
            lineWidth: 2.5,
            stroke: highlightColor,
            opacity: 1,
          },
          dimmed: {
            opacity: 0.4,
          },
        },
      },
      edge: {
        type: 'line',
        style: {
          stroke: '#242424',
          lineWidth: 1.5,
          endArrow: true,
          endArrowFill: '#242424',
          label: true,
          labelText: (datum: any) => datum.label ?? '',
          labelFill: '#737373',
          labelFontSize: 9,
          labelFontFamily: 'Inter',
          labelBackground: true,
          labelBackgroundFill: '#0a0a0a',
          labelBackgroundPadding: [2, 4, 2, 4],
          labelBackgroundRadius: 2,
        },
        state: {
          selected: {
            stroke: highlightColor,
            endArrowFill: highlightColor,
            opacity: 1,
          },
          neighbor: {
            stroke: highlightColor,
            endArrowFill: highlightColor,
            opacity: 1,
          },
          dimmed: {
            opacity: 0.2,
          },
        },
      },
    });

    graphRef.current = graph;

    void graph.render();

    return () => {
      graph.destroy();
      graphRef.current = null;
    };
  }, [data, highlightColor, onSelectEdge, onSelectNode]);

  useEffect(() => {
    if (!graphRef.current) return;

    const graph = graphRef.current;
    const keyword = searchKeyword.trim().toLowerCase();
    const nodes = graph.getNodeData();

    let matchedNodeId: string | null = null;

    graph.updateNodeData(
      nodes.map((node: any) => {
        const kind = node.kind || node.type || 'unknown';
        const matches =
          keyword.length > 0 &&
          (String(node.label || '')
            .toLowerCase()
            .includes(keyword) ||
            String(node.id).toLowerCase().includes(keyword));

        if (matches && !matchedNodeId) matchedNodeId = node.id;

        return {
          id: node.id,
          style: {
            fill: matches ? 'rgba(0, 111, 238, 0.2)' : '#0a0f1d',
            stroke: matches ? highlightColor : getNodeStrokeColor(kind),
            lineWidth: matches ? 3 : 1.5,
          },
        };
      }),
    );

    void graph.draw();

    if (matchedNodeId) {
      void graph.focusElement(matchedNodeId, {
        easing: 'easeCubic',
        duration: 500,
      });
    }
  }, [searchKeyword, highlightColor]);

  return <div ref={containerRef} className="w-full h-full min-h-[450px]" />;
}
