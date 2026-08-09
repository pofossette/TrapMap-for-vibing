import { Card, ListBox } from '@heroui/react';
import { type ReactElement, type ReactNode, useCallback, useState } from 'react';

import type { G6Edge, G6Node } from '@trapmap/web-panel/shared/enum-types';
import { useI18nStore } from '@trapmap/web-panel/stores/i18n-store';

import { G6GraphComponent } from './g6-graph-component';

export type GraphElement = (G6Node & { type: 'node' }) | (G6Edge & { type: 'edge' });

export function useGraphSelection(): {
  selectedElement: GraphElement | null;
  handleSelectNode: (node: G6Node) => void;
  handleSelectEdge: (edge: G6Edge) => void;
  resetSelection: () => void;
} {
  const [selectedElement, setSelectedElement] = useState<GraphElement | null>(null);

  const handleSelectNode = useCallback((node: G6Node) => {
    setSelectedElement({ type: 'node', ...node });
  }, []);

  const handleSelectEdge = useCallback((edge: G6Edge) => {
    setSelectedElement({ type: 'edge', ...edge });
  }, []);

  const resetSelection = useCallback(() => {
    setSelectedElement(null);
  }, []);

  return { selectedElement, handleSelectNode, handleSelectEdge, resetSelection };
}

export function GraphSelectItem({
  id,
  textValue,
  children,
}: {
  id: string;
  textValue: string;
  children: ReactNode;
}): ReactElement {
  return (
    <ListBox.Item
      id={id}
      textValue={textValue}
      className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-panel-text transition duration-150 hover:bg-panel-elevated/60 cursor-pointer outline-none data-[focused=true]:bg-panel-elevated/60 data-[selected=true]:text-panel-accent data-[selected=true]:font-medium"
    >
      {children}
      <ListBox.ItemIndicator>
        <svg
          role="img"
          aria-label="Selected"
          className="h-4 w-4 shrink-0 text-panel-accent"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          viewBox="0 0 24 24"
        >
          <title>Selected</title>
          <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </ListBox.ItemIndicator>
    </ListBox.Item>
  );
}

export function GraphCanvasPane({
  data,
  onSelectNode,
  onSelectEdge,
  searchKeyword,
  onSearchKeywordChange,
  loading,
  loadingLabel,
  searchPlaceholder,
  highlightColor,
}: {
  data: { nodes: G6Node[]; edges: G6Edge[] };
  onSelectNode: (node: G6Node) => void;
  onSelectEdge: (edge: G6Edge) => void;
  searchKeyword: string;
  onSearchKeywordChange: (value: string) => void;
  loading: boolean;
  loadingLabel: string;
  searchPlaceholder: string;
  highlightColor: string;
}): ReactElement {
  return (
    <Card className="border border-panel-line bg-panel-surface flex flex-col relative overflow-hidden">
      <div className="absolute top-4 left-4 z-10 w-[240px]">
        <input
          placeholder={searchPlaceholder}
          className="w-full rounded-xl border border-panel-line bg-panel-surface px-3 py-2 text-sm text-panel-text outline-none"
          value={searchKeyword}
          onChange={(event) => onSearchKeywordChange(event.target.value)}
        />
      </div>

      <div className="flex-1 flex items-center justify-center bg-[#060a13]">
        {loading ? (
          <p className="text-panel-muted animate-pulse">{loadingLabel}</p>
        ) : (
          <G6GraphComponent
            data={data}
            onSelectNode={onSelectNode}
            onSelectEdge={onSelectEdge}
            searchKeyword={searchKeyword}
            highlightColor={highlightColor}
          />
        )}
      </div>
    </Card>
  );
}

export function GraphEdgeInspector({
  element,
  sourceLabel,
  targetLabel,
}: {
  element: G6Edge & { type: 'edge' };
  sourceLabel: string;
  targetLabel: string;
}): ReactElement {
  const { t } = useI18nStore();
  return (
    <div className="space-y-3 font-mono text-xs">
      <div className="grid grid-cols-2">
        <span className="text-panel-muted">{sourceLabel}</span>
        <span className="text-panel-text text-right truncate">{element.source}</span>
      </div>
      <div className="grid grid-cols-2">
        <span className="text-panel-muted">{targetLabel}</span>
        <span className="text-panel-text text-right truncate">{element.target}</span>
      </div>
      <div className="grid grid-cols-2">
        <span className="text-panel-muted">{t('relation')}:</span>
        <span className="text-panel-text text-right capitalize">
          {element.kind || t('connected')}
        </span>
      </div>
    </div>
  );
}
