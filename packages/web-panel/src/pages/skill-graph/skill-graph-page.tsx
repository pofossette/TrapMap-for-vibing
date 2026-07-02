import { Button, Card, Input, Select, SelectItem, Tab, Tabs } from '@heroui/react';
import { type ReactElement, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import type { SkillArtifact } from '@trapmap/contracts';
import { getAdminPanelApi } from '@trapmap/web-panel/services/admin-panel-service-context';
import { PageTransition } from '@trapmap/web-panel/shared/motion';
import { G6GraphComponent, PageContainer, SectionHeader } from '@trapmap/web-panel/shared/ui';
import { useI18nStore } from '@trapmap/web-panel/stores/i18n-store';

export function SkillGraphPage(): ReactElement {
  const { t } = useI18nStore();
  const [searchParams, setSearchParams] = useSearchParams();

  // Selected Artifact state
  const [artifacts, setArtifacts] = useState<SkillArtifact[]>([]);
  const [selectedArtifactId, setSelectedArtifactId] = useState<string>('');

  // View mode derivation vs semantic
  const [viewMode, setViewMode] = useState<'derivation' | 'semantic'>('derivation');

  const [graphData, setGraphData] = useState<{ nodes: any[]; edges: any[] }>({
    nodes: [],
    edges: [],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Inspector selected element
  const [selectedElement, setSelectedElement] = useState<any | null>(null);

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
      setSelectedElement(null); // Reset inspector
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
  }, [selectedArtifactId, viewMode]);

  const handleSelectNode = (node: any) => {
    setSelectedElement({ type: 'node', ...node });
  };

  const handleSelectEdge = (edge: any) => {
    setSelectedElement({ type: 'edge', ...edge });
  };

  const handleArtifactChange = (id: string) => {
    setSelectedArtifactId(id);
    setSearchParams({ artifactId: id });
  };

  return (
    <PageTransition className="space-y-6">
      <PageContainer>
        <SectionHeader
          title={t('skillGraph')}
          description="Analyze compile-time structural derivations and runtime semantic graph mapping for capsules, assets, and script tools."
        />

        {/* View Mode & Artifact Selection Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 bg-panel-surface border border-panel-line rounded-2xl p-4">
          <div className="flex items-center gap-3 min-w-[280px]">
            <span className="text-xs text-panel-muted font-mono uppercase tracking-wider">
              Artifact:
            </span>
            <Select
              aria-label="Select Skill Artifact"
              className="flex-1"
              size="sm"
              selectedKeys={selectedArtifactId ? [selectedArtifactId] : []}
              onSelectionChange={(keys) => handleArtifactChange(String(Array.from(keys)[0]))}
            >
              {artifacts.map((a) => (
                <SelectItem key={a.id} textValue={a.title}>
                  {a.title} ({a.id})
                </SelectItem>
              ))}
            </Select>
          </div>

          <Tabs
            selectedKey={viewMode}
            onSelectionChange={(key) => setViewMode(key as 'derivation' | 'semantic')}
            color="primary"
            variant="underlined"
            classNames={{
              tabList: 'border-b border-panel-line/30',
              tabContent: 'font-semibold text-sm',
            }}
          >
            <Tab key="derivation" title="Derivation View (推导视角)" />
            <Tab key="semantic" title="Semantic Graph (语义关系)" />
          </Tabs>
        </div>

        {error ? (
          <div className="p-6 text-center border border-panel-line rounded-2xl bg-panel-surface">
            <p className="text-rose-400 font-semibold">{error}</p>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[280px,1fr,340px] h-[calc(100vh-290px)] min-h-[460px]">
            {/* Left Controls */}
            <Card className="border border-panel-line bg-panel-surface p-5 flex flex-col gap-6 overflow-y-auto">
              <div>
                <h3 className="font-mono text-xs uppercase tracking-wider text-panel-muted border-b border-panel-line/35 pb-2 mb-3">
                  View Controls
                </h3>
                <div className="text-xs text-panel-muted leading-relaxed space-y-3">
                  {viewMode === 'derivation' ? (
                    <p>
                      <strong>Derivation mode</strong> maps how source code (SKILL.md, references)
                      compile into profiles, capsules, and manifest script configurations.
                    </p>
                  ) : (
                    <p>
                      <strong>Semantic mode</strong> maps how runtime capsules resolve against
                      external cues, tools, environments, and mitigations.
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-auto pt-4 border-t border-panel-line/35 text-xs text-panel-muted space-y-2">
                <p className="font-semibold uppercase tracking-wider">Graph Stats</p>
                <div className="grid grid-cols-2 gap-y-1 text-[11px] font-mono">
                  <span>Nodes:</span>
                  <span className="text-panel-text text-right">{graphData.nodes.length}</span>
                  <span>Edges:</span>
                  <span className="text-panel-text text-right">{graphData.edges.length}</span>
                </div>
              </div>
            </Card>

            {/* Canvas Pane */}
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
                  <p className="text-panel-muted animate-pulse">Rebuilding Layout...</p>
                ) : (
                  <G6GraphComponent
                    data={graphData}
                    onSelectNode={handleSelectNode}
                    onSelectEdge={handleSelectEdge}
                    searchKeyword={searchKeyword}
                    highlightColor="#006fee"
                  />
                )}
              </div>
            </Card>

            {/* Right Inspector Panel */}
            <Card className="border border-panel-line bg-panel-surface p-5 flex flex-col gap-6 overflow-y-auto">
              <h3 className="font-mono text-xs uppercase tracking-wider text-panel-muted border-b border-panel-line/35 pb-2">
                Derivation Inspector
              </h3>

              {selectedElement ? (
                <div className="space-y-4">
                  <div className="border-b border-panel-line/35 pb-3">
                    <span className="inline-flex rounded-full bg-panel-accent/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-panel-accent">
                      {selectedElement.kind || selectedElement.type}
                    </span>
                    <h4 className="mt-2 text-md font-bold text-panel-text">
                      {selectedElement.label ||
                        `${selectedElement.source} → ${selectedElement.target}`}
                    </h4>
                  </div>

                  {selectedElement.type === 'node' ? (
                    <div className="space-y-4">
                      {/* Common fields */}
                      <div className="space-y-2 font-mono text-xs">
                        <div className="grid grid-cols-2">
                          <span className="text-panel-muted">ID:</span>
                          <span className="text-panel-text text-right truncate">
                            {selectedElement.id}
                          </span>
                        </div>
                      </div>

                      {/* Render specialized inspector fields depending on node type */}
                      {selectedElement.kind === 'capsule' && (
                        <div className="space-y-3 pt-3 border-t border-panel-line/20 text-xs">
                          <div>
                            <span className="font-mono text-panel-muted block">
                              Situation context:
                            </span>
                            <p className="mt-1 text-panel-text font-medium leading-relaxed bg-[#0a0f1d] p-3 rounded-lg border border-panel-line/30">
                              {selectedElement.situation || 'JWT validation expiration checks'}
                            </p>
                          </div>
                          <div>
                            <span className="font-mono text-panel-muted block">Goal state:</span>
                            <p className="mt-1 text-panel-text leading-relaxed">
                              {selectedElement.goal || 'Enforce token expiry validation'}
                            </p>
                          </div>
                        </div>
                      )}

                      {selectedElement.kind === 'script' && (
                        <div className="space-y-3 pt-3 border-t border-panel-line/20 text-xs font-mono text-panel-muted">
                          <div className="grid grid-cols-2">
                            <span>Policy:</span>
                            <span className="text-panel-text text-right">Needs Approval</span>
                          </div>
                          <div className="grid grid-cols-2">
                            <span>Side Effect:</span>
                            <span className="text-panel-text text-right">Removes Docker data</span>
                          </div>
                        </div>
                      )}

                      {selectedElement.kind === 'artifact' && (
                        <div className="space-y-3 pt-3 border-t border-panel-line/20 text-xs font-mono text-panel-muted">
                          <div className="grid grid-cols-2">
                            <span>Submitter:</span>
                            <span className="text-panel-text text-right">ops-lead</span>
                          </div>
                          <div className="grid grid-cols-2">
                            <span>Hash:</span>
                            <span className="text-panel-text text-right text-xs truncate">
                              sha-docker-rev1
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Fallback details */}
                      {selectedElement.details && (
                        <div className="pt-2">
                          <span className="text-xs text-panel-muted font-mono block">Details:</span>
                          <p className="text-xs leading-relaxed mt-1">{selectedElement.details}</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3 font-mono text-xs">
                      <div className="grid grid-cols-2">
                        <span className="text-panel-muted">Source ID:</span>
                        <span className="text-panel-text text-right truncate">
                          {selectedElement.source}
                        </span>
                      </div>
                      <div className="grid grid-cols-2">
                        <span className="text-panel-muted">Target ID:</span>
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
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center text-center py-10">
                  <p className="text-xs text-panel-muted max-w-[200px]">
                    Click any derivation node to audit compile-time relationships and verification
                    hashes.
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
