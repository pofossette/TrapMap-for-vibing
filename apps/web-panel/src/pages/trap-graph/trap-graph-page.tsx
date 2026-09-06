import { Button, Card, ListBox, Select } from '@heroui/react';
import { getAdminPanelApi } from '@trapmap/web-panel/services/admin-panel-service-context';
import type { G6Edge, G6Node, TrapNeighborhoodDepth } from '@trapmap/web-panel/shared/enum-types';
import { PageTransition } from '@trapmap/web-panel/shared/motion';
import {
  GraphCanvasPane,
  GraphEdgeInspector,
  type GraphElement,
  GraphSelectItem,
  GraphStats,
  PageContainer,
  SectionHeader,
  useGraphSelection,
} from '@trapmap/web-panel/shared/ui';
import { useI18nStore } from '@trapmap/web-panel/stores/i18n-store';
import {
  type Dispatch,
  type ReactElement,
  type SetStateAction,
  useCallback,
  useEffect,
  useState,
} from 'react';
import {
  applyTrapGraphView,
  isTrapNodeVisibleForLayers,
  parseTrapNeighborhoodDepth,
  type TrapNodeFilterState,
} from './trap-graph-view';

function TrapGraphErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}): ReactElement {
  const { t } = useI18nStore();
  return (
    <div className="p-6 text-center border border-panel-line rounded-2xl bg-panel-surface">
      <p className="text-rose-400 font-semibold">{message}</p>
      <Button className="mt-4" size="sm" variant="secondary" onPress={onRetry}>
        {t('retry')}
      </Button>
    </div>
  );
}

function TrapGraphControls({
  nodeFilter,
  onNodeFilterChange,
  neighborhoodDepth,
  onNeighborhoodDepthChange,
  nodeCount,
  edgeCount,
}: {
  nodeFilter: TrapNodeFilterState;
  onNodeFilterChange: Dispatch<SetStateAction<TrapNodeFilterState>>;
  neighborhoodDepth: TrapNeighborhoodDepth;
  onNeighborhoodDepthChange: Dispatch<SetStateAction<TrapNeighborhoodDepth>>;
  nodeCount: number;
  edgeCount: number;
}): ReactElement {
  const { t } = useI18nStore();
  return (
    <Card className="border border-panel-line bg-panel-surface p-5 flex flex-col gap-6 overflow-y-auto">
      <div>
        <h3 className="font-mono text-xs uppercase tracking-wider text-panel-muted border-b border-panel-line/35 pb-2 mb-3">
          {t('graphLayers')}
        </h3>
        <div className="flex flex-col gap-2.5">
          {(
            [
              ['trap', t('graphLayerTrap')],
              ['cue', t('graphLayerCue')],
              ['tool', t('graphLayerTool')],
              ['environment', t('graphLayerEnvironment')],
              ['mitigation', t('graphLayerMitigation')],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm text-panel-text">
              <input
                type="checkbox"
                checked={nodeFilter[key]}
                onChange={(event) =>
                  onNodeFilterChange((prev) => ({ ...prev, [key]: event.target.checked }))
                }
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-mono text-xs uppercase tracking-wider text-panel-muted border-b border-panel-line/35 pb-2 mb-3">
          {t('neighborhoodDepth')}
        </h3>
        <Select
          aria-label={t('neighborhoodDepth')}
          className="w-full"
          value={neighborhoodDepth}
          onChange={(value) => onNeighborhoodDepthChange(parseTrapNeighborhoodDepth(value))}
        >
          <Select.Trigger className="relative w-full flex items-center justify-between rounded-xl border border-panel-line bg-panel-surface px-3 py-2 text-sm text-panel-text outline-none transition duration-200 focus:ring-1 focus:ring-panel-accent cursor-pointer">
            <Select.Value />
            <Select.Indicator className="text-panel-muted transition-transform duration-200" />
          </Select.Trigger>
          <Select.Popover className="min-w-[220px] rounded-xl border border-panel-line bg-panel-surface p-1.5 shadow-panel">
            <ListBox className="outline-none">
              {[
                { id: '1', label: t('oneHopNeighbors') },
                { id: '2', label: t('twoHopNeighbors') },
                { id: 'all', label: t('fullyConnectedComponent') },
              ].map((option) => (
                <GraphSelectItem key={option.id} id={option.id} textValue={option.label}>
                  {option.label}
                </GraphSelectItem>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      </div>

      <GraphStats nodeCount={nodeCount} edgeCount={edgeCount} />
    </Card>
  );
}

function TrapGraphInspector({
  selectedElement,
}: {
  selectedElement: GraphElement | null;
}): ReactElement {
  const { t } = useI18nStore();
  return (
    <Card className="border border-panel-line bg-panel-surface p-5 flex flex-col gap-6 overflow-y-auto">
      <h3 className="font-mono text-xs uppercase tracking-wider text-panel-muted border-b border-panel-line/35 pb-2">
        {t('graphInspector')}
      </h3>

      {selectedElement ? (
        <div className="space-y-4">
          <div className="border-b border-panel-line/35 pb-3">
            <span className="inline-flex rounded-full bg-panel-accent/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-panel-accent">
              {selectedElement.type}
            </span>
            <h4 className="mt-2 text-md font-bold text-panel-text">
              {selectedElement.label || `${selectedElement.source} → ${selectedElement.target}`}
            </h4>
          </div>

          {selectedElement.type === 'node' ? (
            <div className="space-y-3 font-mono text-xs">
              <div className="grid grid-cols-2">
                <span className="text-panel-muted">{t('nodeId')}:</span>
                <span className="text-panel-text text-right truncate">{selectedElement.id}</span>
              </div>
              <div className="grid grid-cols-2">
                <span className="text-panel-muted">{t('modelType')}:</span>
                <span className="text-panel-text text-right capitalize">
                  {selectedElement.kind}
                </span>
              </div>
              {selectedElement.severity && (
                <div className="grid grid-cols-2">
                  <span className="text-panel-muted">{t('severity')}:</span>
                  <span className="text-rose-400 font-bold text-right capitalize">
                    {selectedElement.severity}
                  </span>
                </div>
              )}
              {selectedElement.scope && (
                <div className="grid grid-cols-2">
                  <span className="text-panel-muted">{t('scope')}:</span>
                  <span className="text-panel-text text-right capitalize">
                    {selectedElement.scope}
                  </span>
                </div>
              )}
              {selectedElement.requiredLevel !== undefined && (
                <div className="grid grid-cols-2">
                  <span className="text-panel-muted">{t('requiredLevel')}:</span>
                  <span className="text-panel-text text-right">
                    {selectedElement.requiredLevel}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <GraphEdgeInspector
              element={selectedElement}
              sourceLabel={`${t('source')}:`}
              targetLabel={`${t('target')}:`}
            />
          )}

          <div className="pt-4 border-t border-panel-line/35">
            <span className="text-xs text-panel-muted block mb-1">{t('evidenceNotes')}</span>
            <p className="text-xs leading-relaxed text-panel-muted">
              {selectedElement.evidence || selectedElement.details || t('noEvidenceLinked')}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-center py-10">
          <p className="text-xs text-panel-muted max-w-[200px]">{t('selectGraphElementTip')}</p>
        </div>
      )}
    </Card>
  );
}

export function TrapGraphPage(): ReactElement {
  const { t } = useI18nStore();
  const [neighborhoodDepth, setNeighborhoodDepth] = useState<TrapNeighborhoodDepth>('1');

  const [graphData, setGraphData] = useState<{ nodes: G6Node[]; edges: G6Edge[] }>({
    nodes: [],
    edges: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Inspector selected element
  const { selectedElement, handleSelectNode, handleSelectEdge, resetSelection } =
    useGraphSelection();

  // Search keyword
  const [searchKeyword, setSearchKeyword] = useState('');

  // Graph filters state
  const [nodeFilter, setNodeFilter] = useState<TrapNodeFilterState>({
    trap: true,
    cue: true,
    tool: true,
    environment: true,
    mitigation: true,
  });

  const fetchGraph = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAdminPanelApi().loadTrapGraph();
      setGraphData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load trap graph');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchGraph();
  }, [fetchGraph]);

  const selectedNodeId = selectedElement?.type === 'node' ? selectedElement.id : null;

  useEffect(() => {
    if (!selectedNodeId) return;
    const selectedNode = graphData.nodes.find((node) => node.id === selectedNodeId);
    if (!selectedNode || !isTrapNodeVisibleForLayers(selectedNode, nodeFilter)) {
      resetSelection();
    }
  }, [graphData.nodes, nodeFilter, resetSelection, selectedNodeId]);

  const displayData = applyTrapGraphView(
    graphData,
    nodeFilter,
    neighborhoodDepth,
    selectedElement?.type === 'node' ? selectedElement.id : null,
  );

  return (
    <PageTransition className="space-y-6">
      <PageContainer>
        <SectionHeader title={t('trapGraph')} description={t('trapGraphDesc')} />

        {error ? (
          <TrapGraphErrorBanner message={error} onRetry={() => void fetchGraph()} />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[280px,1fr,340px] h-[calc(100vh-230px)] min-h-[500px]">
            {/* Left Control Panel */}
            <TrapGraphControls
              nodeFilter={nodeFilter}
              onNodeFilterChange={setNodeFilter}
              neighborhoodDepth={neighborhoodDepth}
              onNeighborhoodDepthChange={setNeighborhoodDepth}
              nodeCount={displayData.nodes.length}
              edgeCount={displayData.edges.length}
            />

            {/* Center Canvas Pane */}
            <GraphCanvasPane
              data={displayData}
              onSelectNode={handleSelectNode}
              onSelectEdge={handleSelectEdge}
              searchKeyword={searchKeyword}
              onSearchKeywordChange={setSearchKeyword}
              loading={loading}
              loadingLabel={t('initializingGraphEngine')}
              searchPlaceholder={t('searchGraphNode')}
              highlightColor="#f97316"
            />

            {/* Right Inspector Panel */}
            <TrapGraphInspector selectedElement={selectedElement} />
          </div>
        )}
      </PageContainer>
    </PageTransition>
  );
}
