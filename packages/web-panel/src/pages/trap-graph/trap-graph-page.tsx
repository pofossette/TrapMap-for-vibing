import { Button, Card, Checkbox, Input, Select, SelectItem } from '@heroui/react';
import { type ReactElement, useCallback, useEffect, useState } from 'react';

import { getAdminPanelApi } from '@trapmap/web-panel/services/admin-panel-service-context';
import { PageTransition } from '@trapmap/web-panel/shared/motion';
import { G6GraphComponent, PageContainer, SectionHeader } from '@trapmap/web-panel/shared/ui';
import { useI18nStore } from '@trapmap/web-panel/stores/i18n-store';

export function TrapGraphPage(): ReactElement {
  const { t } = useI18nStore();

  const [graphData, setGraphData] = useState<{ nodes: any[]; edges: any[] }>({
    nodes: [],
    edges: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Inspector selected element
  const [selectedElement, setSelectedElement] = useState<any | null>(null);

  // Search keyword
  const [searchKeyword, setSearchKeyword] = useState('');

  // Graph filters state
  const [nodeFilter, setNodeFilter] = useState({
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

  const handleSelectNode = (node: any) => {
    setSelectedElement({ type: 'node', ...node });
  };

  const handleSelectEdge = (edge: any) => {
    setSelectedElement({ type: 'edge', ...edge });
  };

  // Apply filters locally
  const filteredNodes = graphData.nodes.filter((node) => {
    const kind = node.kind || 'unknown';
    if (kind === 'trap' && !nodeFilter.trap) return false;
    if (kind === 'cue' && !nodeFilter.cue) return false;
    if (kind === 'tool' && !nodeFilter.tool) return false;
    if (kind === 'environment' && !nodeFilter.environment) return false;
    if (kind === 'mitigation' && !nodeFilter.mitigation) return false;
    return true;
  });

  const filteredEdges = graphData.edges.filter((edge) => {
    // Only include edge if source and target are not filtered out
    const sourceExists = filteredNodes.some((n) => n.id === edge.source);
    const targetExists = filteredNodes.some((n) => n.id === edge.target);
    return sourceExists && targetExists;
  });

  const displayData = {
    nodes: filteredNodes,
    edges: filteredEdges,
  };

  return (
    <PageTransition className="space-y-6">
      <PageContainer>
        <SectionHeader
          title={t('trapGraph')}
          description="Topology mapping and dependency analysis for threat vectors, triggers, environments, and mitigations."
        />

        {error ? (
          <div className="p-6 text-center border border-panel-line rounded-2xl bg-panel-surface">
            <p className="text-rose-400 font-semibold">{error}</p>
            <Button className="mt-4" size="sm" variant="flat" onPress={() => void fetchGraph()}>
              Retry
            </Button>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[280px,1fr,340px] h-[calc(100vh-230px)] min-h-[500px]">
            {/* Left Control Panel */}
            <Card className="border border-panel-line bg-panel-surface p-5 flex flex-col gap-6 overflow-y-auto">
              <div>
                <h3 className="font-mono text-xs uppercase tracking-wider text-panel-muted border-b border-panel-line/35 pb-2 mb-3">
                  Graph Layers
                </h3>
                <div className="flex flex-col gap-2.5">
                  <Checkbox
                    isSelected={nodeFilter.trap}
                    onValueChange={(val) => setNodeFilter((prev) => ({ ...prev, trap: val }))}
                  >
                    Trap (Threat Risks)
                  </Checkbox>
                  <Checkbox
                    isSelected={nodeFilter.cue}
                    onValueChange={(val) => setNodeFilter((prev) => ({ ...prev, cue: val }))}
                  >
                    Cue (Signatures)
                  </Checkbox>
                  <Checkbox
                    isSelected={nodeFilter.tool}
                    onValueChange={(val) => setNodeFilter((prev) => ({ ...prev, tool: val }))}
                  >
                    Tool (Penetration)
                  </Checkbox>
                  <Checkbox
                    isSelected={nodeFilter.environment}
                    onValueChange={(val) =>
                      setNodeFilter((prev) => ({ ...prev, environment: val }))
                    }
                  >
                    Environment
                  </Checkbox>
                  <Checkbox
                    isSelected={nodeFilter.mitigation}
                    onValueChange={(val) => setNodeFilter((prev) => ({ ...prev, mitigation: val }))}
                  >
                    Mitigation
                  </Checkbox>
                </div>
              </div>

              <div>
                <h3 className="font-mono text-xs uppercase tracking-wider text-panel-muted border-b border-panel-line/35 pb-2 mb-3">
                  Neighborhood Depth
                </h3>
                <Select size="sm" defaultSelectedKeys={['1']}>
                  <SelectItem key="1">1-Hop Neighbors</SelectItem>
                  <SelectItem key="2">2-Hop Neighbors</SelectItem>
                  <SelectItem key="all">Fully Connected Component</SelectItem>
                </Select>
              </div>

              <div className="mt-auto pt-4 border-t border-panel-line/35 text-xs text-panel-muted space-y-2">
                <p className="font-semibold uppercase tracking-wider">Graph Stats</p>
                <div className="grid grid-cols-2 gap-y-1 text-[11px] font-mono">
                  <span>Nodes:</span>
                  <span className="text-panel-text text-right">{filteredNodes.length}</span>
                  <span>Edges:</span>
                  <span className="text-panel-text text-right">{filteredEdges.length}</span>
                </div>
              </div>
            </Card>

            {/* Center Canvas Pane */}
            <Card className="border border-panel-line bg-panel-surface flex flex-col relative overflow-hidden">
              <div className="absolute top-4 left-4 z-10 w-[240px]">
                <Input
                  isClearable
                  placeholder="Search graph node..."
                  size="sm"
                  value={searchKeyword}
                  onValueChange={setSearchKeyword}
                />
              </div>

              <div className="flex-1 flex items-center justify-center bg-[#060a13]">
                {loading ? (
                  <p className="text-panel-muted animate-pulse">Initializing Graph Engine...</p>
                ) : (
                  <G6GraphComponent
                    data={displayData}
                    onSelectNode={handleSelectNode}
                    onSelectEdge={handleSelectEdge}
                    searchKeyword={searchKeyword}
                    highlightColor="#f97316"
                  />
                )}
              </div>
            </Card>

            {/* Right Inspector Panel */}
            <Card className="border border-panel-line bg-panel-surface p-5 flex flex-col gap-6 overflow-y-auto">
              <h3 className="font-mono text-xs uppercase tracking-wider text-panel-muted border-b border-panel-line/35 pb-2">
                Graph Inspector
              </h3>

              {selectedElement ? (
                <div className="space-y-4">
                  <div className="border-b border-panel-line/35 pb-3">
                    <span className="inline-flex rounded-full bg-panel-accent/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-panel-accent">
                      {selectedElement.type}
                    </span>
                    <h4 className="mt-2 text-md font-bold text-panel-text">
                      {selectedElement.label ||
                        `${selectedElement.source} → ${selectedElement.target}`}
                    </h4>
                  </div>

                  {selectedElement.type === 'node' ? (
                    <div className="space-y-3 font-mono text-xs">
                      <div className="grid grid-cols-2">
                        <span className="text-panel-muted">Node ID:</span>
                        <span className="text-panel-text text-right truncate">
                          {selectedElement.id}
                        </span>
                      </div>
                      <div className="grid grid-cols-2">
                        <span className="text-panel-muted">Model Type:</span>
                        <span className="text-panel-text text-right capitalize">
                          {selectedElement.kind}
                        </span>
                      </div>
                      {selectedElement.severity && (
                        <div className="grid grid-cols-2">
                          <span className="text-panel-muted">Severity:</span>
                          <span className="text-rose-400 font-bold text-right capitalize">
                            {selectedElement.severity}
                          </span>
                        </div>
                      )}
                      {selectedElement.scope && (
                        <div className="grid grid-cols-2">
                          <span className="text-panel-muted">Scope:</span>
                          <span className="text-panel-text text-right capitalize">
                            {selectedElement.scope}
                          </span>
                        </div>
                      )}
                      {selectedElement.requiredLevel !== undefined && (
                        <div className="grid grid-cols-2">
                          <span className="text-panel-muted">Required Level:</span>
                          <span className="text-panel-text text-right">
                            {selectedElement.requiredLevel}
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3 font-mono text-xs">
                      <div className="grid grid-cols-2">
                        <span className="text-panel-muted">Source:</span>
                        <span className="text-panel-text text-right truncate">
                          {selectedElement.source}
                        </span>
                      </div>
                      <div className="grid grid-cols-2">
                        <span className="text-panel-muted">Target:</span>
                        <span className="text-panel-text text-right truncate">
                          {selectedElement.target}
                        </span>
                      </div>
                      <div className="grid grid-cols-2">
                        <span className="text-panel-muted">Relation:</span>
                        <span className="text-panel-text text-right capitalize">
                          {selectedElement.kind || 'Connected'}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="pt-4 border-t border-panel-line/35">
                    <span className="text-xs text-panel-muted block mb-1">Evidence / Notes</span>
                    <p className="text-xs leading-relaxed text-panel-muted">
                      {selectedElement.evidence ||
                        selectedElement.details ||
                        'No evidence linked to this topology item.'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center text-center py-10">
                  <p className="text-xs text-panel-muted max-w-[200px]">
                    Click any node or link in the graph to view context and metadata.
                  </p>
                </div>
              )}
            </Card>
          </div>
        )}
      </PageContainer>
    </PageTransition>
  );
}
