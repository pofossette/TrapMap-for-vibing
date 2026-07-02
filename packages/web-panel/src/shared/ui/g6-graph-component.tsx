import { type ReactElement, useEffect, useRef } from 'react';

declare const G6: any;

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

export function G6GraphComponent({
  data,
  onSelectNode,
  onSelectEdge,
  searchKeyword = '',
  highlightColor = '#006fee',
}: G6GraphComponentProps): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const g6Instance = typeof G6 !== 'undefined' ? G6 : (window as any).G6;
    if (!g6Instance) {
      console.error('AntV G6 engine not loaded.');
      return;
    }

    containerRef.current.innerHTML = '';

    const width = containerRef.current.clientWidth || 600;
    const height = containerRef.current.clientHeight || 500;

    const graph = new g6Instance.Graph({
      container: containerRef.current,
      width,
      height,
      modes: {
        default: ['drag-canvas', 'zoom-canvas', 'drag-node'],
      },
      layout: {
        type: 'force',
        preventOverlap: true,
        nodeSize: 42,
        linkDistance: 120,
        nodeStrength: -60,
      },
      defaultNode: {
        size: 42,
        style: {
          fill: '#0a0f1d',
          stroke: '#242424',
          lineWidth: 1.5,
          cursor: 'pointer',
        },
        labelCfg: {
          position: 'bottom',
          style: {
            fill: '#ffffff',
            fontSize: 11,
            fontFamily: 'Inter',
          },
        },
      },
      defaultEdge: {
        style: {
          stroke: '#242424',
          lineWidth: 1.5,
          lineDash: [0],
          endArrow: {
            path: g6Instance.Arrow.triangle(5, 5, 4),
            d: 4,
            fill: '#242424',
          },
        },
        labelCfg: {
          style: {
            fill: '#737373',
            fontSize: 9,
            fontFamily: 'Inter',
            background: {
              fill: '#0a0a0a',
              padding: [2, 4],
              radius: 2,
            },
          },
        },
      },
    });

    // Color schema based on Node kind
    const formattedData = {
      nodes: data.nodes.map((node) => {
        const kind = node.kind || node.type || 'unknown';
        let strokeColor = '#242424';
        let fillColor = '#0a0f1d';

        if (kind === 'trap') strokeColor = '#f97316';
        else if (kind === 'artifact') strokeColor = '#006fee';
        else if (kind === 'capsule') strokeColor = '#22c55e';
        else if (kind === 'profile') strokeColor = '#a855f7';
        else if (kind === 'cue') strokeColor = '#eab308';
        else if (kind === 'tool') strokeColor = '#7dd3fc';
        else if (kind === 'mitigation') strokeColor = '#10b981';

        return {
          ...node,
          style: {
            ...node.style,
            stroke: strokeColor,
            fill: fillColor,
          },
        };
      }),
      edges: data.edges,
    };

    graph.data(formattedData);
    graph.render();
    graphRef.current = graph;

    // Listeners
    graph.on('node:click', (evt: any) => {
      const item = evt.item;
      const model = item.getModel();
      onSelectNode(model);

      // Selection highlighting
      graph.getNodes().forEach((n: any) => {
        const m = n.getModel();
        const isSelected = m.id === model.id;
        const nKind = m.kind || m.type || '';
        let baseStroke = '#242424';
        if (nKind === 'trap') baseStroke = '#f97316';
        else if (nKind === 'artifact') baseStroke = '#006fee';
        else if (nKind === 'capsule') baseStroke = '#22c55e';
        else if (nKind === 'profile') baseStroke = '#a855f7';
        else if (nKind === 'cue') baseStroke = '#eab308';
        else if (nKind === 'tool') baseStroke = '#7dd3fc';
        else if (nKind === 'mitigation') baseStroke = '#10b981';

        graph.updateItem(n, {
          style: {
            lineWidth: isSelected ? 3.5 : 1.5,
            stroke: isSelected ? highlightColor : baseStroke,
            opacity: isSelected ? 1 : 0.4,
          },
        });
      });

      // Edge highlighting
      graph.getEdges().forEach((e: any) => {
        const edgeModel = e.getModel();
        const connected = edgeModel.source === model.id || edgeModel.target === model.id;
        graph.updateItem(e, {
          style: {
            stroke: connected ? highlightColor : '#242424',
            opacity: connected ? 1 : 0.2,
          },
        });
      });
    });

    graph.on('node:dragstart', (e: any) => {
      graph.layout();
      refreshDraggedNodePosition(e);
    });

    graph.on('node:drag', (e: any) => {
      refreshDraggedNodePosition(e);
    });

    function refreshDraggedNodePosition(e: any) {
      const model = e.item.get('model');
      model.fx = e.x;
      model.fy = e.y;
    }

    graph.on('edge:click', (evt: any) => {
      const model = evt.item.getModel();
      onSelectEdge(model);
    });

    graph.on('canvas:click', () => {
      // Clear selection styling
      graph.getNodes().forEach((n: any) => {
        const m = n.getModel();
        const nKind = m.kind || m.type || '';
        let baseStroke = '#242424';
        if (nKind === 'trap') baseStroke = '#f97316';
        else if (nKind === 'artifact') baseStroke = '#006fee';
        else if (nKind === 'capsule') baseStroke = '#22c55e';
        else if (nKind === 'profile') baseStroke = '#a855f7';
        else if (nKind === 'cue') baseStroke = '#eab308';
        else if (nKind === 'tool') baseStroke = '#7dd3fc';
        else if (nKind === 'mitigation') baseStroke = '#10b981';

        graph.updateItem(n, {
          style: {
            lineWidth: 1.5,
            stroke: baseStroke,
            opacity: 1,
          },
        });
      });

      graph.getEdges().forEach((e: any) => {
        graph.updateItem(e, {
          style: {
            stroke: '#242424',
            opacity: 1,
          },
        });
      });
    });

    graph.fitView(20);

    return () => {
      if (graphRef.current) {
        graphRef.current.destroy();
      }
    };
  }, [data]);

  // Search filter focus
  useEffect(() => {
    if (!graphRef.current || !searchKeyword) return;
    const graph = graphRef.current;
    const nodes = graph.getNodes();
    let matchedNode: any = null;

    nodes.forEach((n: any) => {
      const model = n.getModel();
      const match =
        model.label.toLowerCase().includes(searchKeyword.toLowerCase()) ||
        model.id.toLowerCase().includes(searchKeyword.toLowerCase());

      if (match && !matchedNode) matchedNode = n;

      graph.updateItem(n, {
        style: {
          lineWidth: match ? 3 : 1.5,
          stroke: match ? highlightColor : '#242424',
          fill: match ? 'rgba(0, 111, 238, 0.2)' : '#0a0f1d',
        },
      });
    });

    if (matchedNode) {
      graph.focusItem(matchedNode, true, {
        easing: 'easeCubic',
        duration: 500,
      });
    }
  }, [searchKeyword, highlightColor]);

  return <div ref={containerRef} className="w-full h-full min-h-[450px]" />;
}
