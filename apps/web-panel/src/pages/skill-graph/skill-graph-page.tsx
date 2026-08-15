import { Card, ListBox, Select } from '@heroui/react';
import { type ReactElement, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import type { SkillArtifact } from '@trapmap/contracts';
import { getAdminPanelApi } from '@trapmap/web-panel/services/admin-panel-service-context';
import type { G6Edge, G6Node } from '@trapmap/web-panel/shared/enum-types';
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

type GraphViewMode = 'derivation' | 'semantic';

function SkillGraphToolbar({
  artifacts,
  selectedArtifactId,
  onArtifactChange,
  viewMode,
  onViewModeChange,
}: {
  artifacts: SkillArtifact[];
  selectedArtifactId: string;
  onArtifactChange: (id: string) => void;
  viewMode: GraphViewMode;
  onViewModeChange: (mode: GraphViewMode) => void;
}): ReactElement {
  const { t } = useI18nStore();
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 bg-panel-surface border border-panel-line rounded-2xl p-4">
      <div className="flex items-center gap-3 min-w-[280px]">
        <span className="text-xs text-panel-muted font-mono uppercase tracking-wider">
          {t('artifactSelector')}:
        </span>
        <Select
          aria-label={t('selectSkillArtifact')}
          className="flex-1"
          value={selectedArtifactId}
          onChange={(value) => onArtifactChange(value ? String(value) : '')}
        >
          <Select.Trigger className="relative w-full flex items-center justify-between rounded-xl border border-panel-line bg-panel-surface px-3 py-2 text-sm text-panel-text outline-none transition duration-200 focus:ring-1 focus:ring-panel-accent cursor-pointer">
            <Select.Value />
            <Select.Indicator className="text-panel-muted transition-transform duration-200" />
          </Select.Trigger>
          <Select.Popover className="min-w-[280px] rounded-xl border border-panel-line bg-panel-surface p-1.5 shadow-panel">
            <ListBox className="outline-none">
              {artifacts.map((artifact) => (
                <GraphSelectItem
                  key={artifact.id}
                  id={artifact.id}
                  textValue={`${artifact.title} (${artifact.id})`}
                >
                  <span className="truncate">{artifact.title}</span>
                  <span className="shrink-0 font-mono text-[11px] text-panel-muted">
                    {artifact.id}
                  </span>
                </GraphSelectItem>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      </div>

      <div className="inline-flex rounded-full border border-panel-line bg-panel-surface-strong p-1">
        {(['derivation', 'semantic'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              viewMode === mode
                ? 'bg-panel-text text-[var(--panel-bg)]'
                : 'text-panel-muted hover:text-panel-text'
            }`}
            onClick={() => onViewModeChange(mode)}
          >
            {mode === 'derivation' ? t('derivationView') : t('semanticGraph')}
          </button>
        ))}
      </div>
    </div>
  );
}

function SkillGraphControls({
  viewMode,
  graphData,
}: {
  viewMode: GraphViewMode;
  graphData: { nodes: G6Node[]; edges: G6Edge[] };
}): ReactElement {
  const { t } = useI18nStore();
  return (
    <Card className="border border-panel-line bg-panel-surface p-5 flex flex-col gap-6 overflow-y-auto">
      <div>
        <h3 className="font-mono text-xs uppercase tracking-wider text-panel-muted border-b border-panel-line/35 pb-2 mb-3">
          {t('viewControls')}
        </h3>
        <div className="text-xs text-panel-muted leading-relaxed space-y-3">
          {viewMode === 'derivation' ? (
            <p>{t('derivationModeDesc')}</p>
          ) : (
            <p>{t('semanticModeDesc')}</p>
          )}
        </div>
      </div>

      <GraphStats nodeCount={graphData.nodes.length} edgeCount={graphData.edges.length} />
    </Card>
  );
}

function SkillGraphInspector({
  selectedElement,
}: {
  selectedElement: GraphElement | null;
}): ReactElement {
  const { t } = useI18nStore();
  return (
    <Card className="border border-panel-line bg-panel-surface p-5 flex flex-col gap-6 overflow-y-auto">
      <h3 className="font-mono text-xs uppercase tracking-wider text-panel-muted border-b border-panel-line/35 pb-2">
        {t('derivationInspector')}
      </h3>

      {selectedElement ? (
        <div className="space-y-4">
          <div className="border-b border-panel-line/35 pb-3">
            <span className="inline-flex rounded-full bg-panel-accent/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-panel-accent">
              {selectedElement.kind || selectedElement.type}
            </span>
            <h4 className="mt-2 text-md font-bold text-panel-text">
              {selectedElement.label || `${selectedElement.source} → ${selectedElement.target}`}
            </h4>
          </div>

          {selectedElement.type === 'node' ? (
            <div className="space-y-4">
              {/* Common fields */}
              <div className="space-y-2 font-mono text-xs">
                <div className="grid grid-cols-2">
                  <span className="text-panel-muted">{t('idLabel')}:</span>
                  <span className="text-panel-text text-right truncate">{selectedElement.id}</span>
                </div>
              </div>

              {/* Render specialized inspector fields depending on node type */}
              {selectedElement.kind === 'capsule' && (
                <div className="space-y-3 pt-3 border-t border-panel-line/20 text-xs">
                  <div>
                    <span className="font-mono text-panel-muted block">
                      {t('situationContext')}:
                    </span>
                    <p className="mt-1 text-panel-text font-medium leading-relaxed bg-[#0a0f1d] p-3 rounded-lg border border-panel-line/30">
                      {selectedElement.situation || 'JWT validation expiration checks'}
                    </p>
                  </div>
                  <div>
                    <span className="font-mono text-panel-muted block">{t('goalState')}:</span>
                    <p className="mt-1 text-panel-text leading-relaxed">
                      {selectedElement.goal || 'Enforce token expiry validation'}
                    </p>
                  </div>
                </div>
              )}

              {selectedElement.kind === 'script' && (
                <div className="space-y-3 pt-3 border-t border-panel-line/20 text-xs font-mono text-panel-muted">
                  <div className="grid grid-cols-2">
                    <span>{t('policy')}:</span>
                    <span className="text-panel-text text-right">{t('needsApproval')}</span>
                  </div>
                  <div className="grid grid-cols-2">
                    <span>{t('sideEffect')}:</span>
                    <span className="text-panel-text text-right">{t('removesDockerData')}</span>
                  </div>
                </div>
              )}

              {selectedElement.kind === 'artifact' && (
                <div className="space-y-3 pt-3 border-t border-panel-line/20 text-xs font-mono text-panel-muted">
                  <div className="grid grid-cols-2">
                    <span>{t('submitter')}:</span>
                    <span className="text-panel-text text-right">ops-lead</span>
                  </div>
                  <div className="grid grid-cols-2">
                    <span>{t('hash')}:</span>
                    <span className="text-panel-text text-right text-xs truncate">
                      sha-docker-rev1
                    </span>
                  </div>
                </div>
              )}

              {/* Fallback details */}
              {selectedElement.details && (
                <div className="pt-2">
                  <span className="text-xs text-panel-muted font-mono block">{t('details')}:</span>
                  <p className="text-xs leading-relaxed mt-1">{selectedElement.details}</p>
                </div>
              )}
            </div>
          ) : (
            <GraphEdgeInspector
              element={selectedElement}
              sourceLabel={`${t('source')} ID:`}
              targetLabel={`${t('target')} ID:`}
            />
          )}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-center py-10">
          <p className="text-xs text-panel-muted max-w-[200px]">{t('selectDerivationElement')}</p>
        </div>
      )}
    </Card>
  );
}

export function SkillGraphPage(): ReactElement {
  const { t } = useI18nStore();
  const [searchParams, setSearchParams] = useSearchParams();

  // Selected Artifact state
  const [artifacts, setArtifacts] = useState<SkillArtifact[]>([]);
  const [selectedArtifactId, setSelectedArtifactId] = useState<string>('');

  // View mode derivation vs semantic
  const [viewMode, setViewMode] = useState<GraphViewMode>('derivation');

  const [graphData, setGraphData] = useState<{ nodes: G6Node[]; edges: G6Edge[] }>({
    nodes: [],
    edges: [],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Inspector selected element
  const { selectedElement, handleSelectNode, handleSelectEdge, resetSelection } =
    useGraphSelection();

  // Search keyword
  const [searchKeyword, setSearchKeyword] = useState('');

  // Load all artifacts for selector
  useEffect(() => {
    const loadList = async () => {
      try {
        const res = await getAdminPanelApi().loadArtifacts();
        setArtifacts(res.items);

        // Determine initial artifact id
        const urlId = searchParams.get('artifactId');
        if (urlId && res.items.some((a) => a.id === urlId)) {
          setSelectedArtifactId(urlId);
        } else if (res.items[0]) {
          setSelectedArtifactId(res.items[0].id);
        }
      } catch (err) {
        console.error('Failed to load artifacts list', err);
      }
    };
    void loadList();
  }, [searchParams]);

  // Load graph data based on selected artifact and view mode
  useEffect(() => {
    if (!selectedArtifactId) return;

    const fetchGraph = async () => {
      setLoading(true);
      setError(null);
      resetSelection(); // Reset inspector
      try {
        const data = await getAdminPanelApi().loadSkillGraph(selectedArtifactId, {
          mode: viewMode,
        });
        setGraphData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load skill graph');
      } finally {
        setLoading(false);
      }
    };

    void fetchGraph();
  }, [selectedArtifactId, viewMode, resetSelection]);

  const handleArtifactChange = (id: string) => {
    setSelectedArtifactId(id);
    setSearchParams({ artifactId: id });
  };

  return (
    <PageTransition className="space-y-6">
      <PageContainer>
        <SectionHeader title={t('skillGraph')} description={t('skillGraphDesc')} />

        {/* View Mode & Artifact Selection Bar */}
        <SkillGraphToolbar
          artifacts={artifacts}
          selectedArtifactId={selectedArtifactId}
          onArtifactChange={handleArtifactChange}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />

        {error ? (
          <div className="p-6 text-center border border-panel-line rounded-2xl bg-panel-surface">
            <p className="text-rose-400 font-semibold">{error}</p>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[280px,1fr,340px] h-[calc(100vh-290px)] min-h-[460px]">
            {/* Left Controls */}
            <SkillGraphControls viewMode={viewMode} graphData={graphData} />

            {/* Canvas Pane */}
            <GraphCanvasPane
              data={graphData}
              onSelectNode={handleSelectNode}
              onSelectEdge={handleSelectEdge}
              searchKeyword={searchKeyword}
              onSearchKeywordChange={setSearchKeyword}
              loading={loading}
              loadingLabel={t('rebuildingLayout')}
              searchPlaceholder={t('searchGraphNode')}
              highlightColor="#006fee"
            />

            {/* Right Inspector Panel */}
            <SkillGraphInspector selectedElement={selectedElement} />
          </div>
        )}
      </PageContainer>
    </PageTransition>
  );
}
