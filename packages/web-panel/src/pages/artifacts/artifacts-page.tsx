import {
  Button,
  Chip,
  Input,
  Select,
  SelectItem,
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
  DrawerFooter,
} from '@heroui/react';
import { type ReactElement, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { getAdminPanelApi } from '@trapmap/web-panel/services/admin-panel-service-context';
import { PageTransition } from '@trapmap/web-panel/shared/motion';
import { PageContainer, SectionHeader, StatusBadge } from '@trapmap/web-panel/shared/ui';
import { useI18nStore } from '@trapmap/web-panel/stores/i18n-store';
import type { SkillArtifact } from '@trapmap/contracts';

export function ArtifactsPage(): ReactElement {
  const { t } = useI18nStore();
  const navigate = useNavigate();

  const [artifacts, setArtifacts] = useState<SkillArtifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters state
  const [search, setSearch] = useState('');
  const [lifecycleState, setLifecycleState] = useState('all');
  const [scope, setScope] = useState('all');

  // Detail Drawer state
  const [selectedArtifact, setSelectedArtifact] = useState<SkillArtifact | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const fetchArtifacts = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getAdminPanelApi().loadArtifacts({
        search: search || undefined,
        lifecycleState: lifecycleState === 'all' ? undefined : lifecycleState,
        scope: scope === 'all' ? undefined : scope,
      });
      setArtifacts(response.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load artifacts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchArtifacts();
  }, [search, lifecycleState, scope]);

  const handleRowClick = async (artifact: SkillArtifact) => {
    setSelectedArtifact(artifact);
    setDrawerOpen(true);
    setDetailLoading(true);
    try {
      const detailed = await getAdminPanelApi().loadArtifactDetail(artifact.id);
      setSelectedArtifact(detailed);
    } catch (err) {
      console.error('Failed to load artifact details', err);
    } finally {
      setDetailLoading(false);
    }
  };

  const activeRevision = selectedArtifact?.history.find(
    (h) => h.revision === selectedArtifact.latestRevision,
  );

  return (
    <PageTransition className="space-y-6">
      <PageContainer>
        <SectionHeader
          title={t('artifacts')}
          description="View and inspect governed skill artifacts, knowledge revisions, and derived capsules."
        />

        {/* Filters bar */}
        <div className="grid gap-4 md:grid-cols-3 bg-panel-surface border border-panel-line rounded-2xl p-4">
          <Input
            isClearable
            className="w-full"
            placeholder="Search by ID or title..."
            value={search}
            onValueChange={setSearch}
            size="sm"
          />

          <Select
            label="Lifecycle State"
            size="sm"
            selectedKeys={[lifecycleState]}
            onSelectionChange={(keys) => setLifecycleState(String(Array.from(keys)[0]))}
          >
            <SelectItem key="all" textValue="All States">
              All States
            </SelectItem>
            <SelectItem key="active" textValue="Active">
              Active
            </SelectItem>
            <SelectItem key="submitted" textValue="Submitted">
              Submitted
            </SelectItem>
            <SelectItem key="draft" textValue="Draft">
              Draft
            </SelectItem>
          </Select>

          <Select
            label="Scope"
            size="sm"
            selectedKeys={[scope]}
            onSelectionChange={(keys) => setScope(String(Array.from(keys)[0]))}
          >
            <SelectItem key="all" textValue="All Scopes">
              All Scopes
            </SelectItem>
            <SelectItem key="global" textValue="Global">
              Global
            </SelectItem>
            <SelectItem key="project" textValue="Project">
              Project
            </SelectItem>
          </Select>
        </div>

        {/* Artifacts Table */}
        {error ? (
          <div className="p-6 text-center border border-panel-line rounded-2xl bg-panel-surface">
            <p className="text-rose-400 font-semibold">{error}</p>
            <Button className="mt-4" size="sm" variant="flat" onPress={() => void fetchArtifacts()}>
              Retry
            </Button>
          </div>
        ) : (
          <div className="border border-panel-line rounded-2xl bg-panel-surface overflow-hidden">
            <Table
              aria-label="Governed Artifacts Table"
              selectionMode="single"
              onRowAction={(key) => {
                const item = artifacts.find((a) => a.id === key);
                if (item) void handleRowClick(item);
              }}
              classNames={{
                wrapper: 'bg-transparent p-0 shadow-none',
                th: 'bg-panel-surface-strong text-panel-muted font-mono text-[11px] uppercase tracking-wider py-3 px-4 border-b border-panel-line',
                td: 'py-3 px-4 border-b border-panel-line/30 text-sm text-panel-text font-medium',
              }}
            >
              <TableHeader>
                <TableColumn>ID</TableColumn>
                <TableColumn>TITLE</TableColumn>
                <TableColumn>SCOPE</TableColumn>
                <TableColumn>REQ LEVEL</TableColumn>
                <TableColumn>STATE</TableColumn>
                <TableColumn>REVISION</TableColumn>
                <TableColumn>UPDATED AT</TableColumn>
              </TableHeader>
              <TableBody emptyContent="No governed artifacts found." isLoading={loading}>
                {artifacts.map((art) => (
                  <TableRow
                    key={art.id}
                    className="hover:bg-panel-surface-strong cursor-pointer transition"
                  >
                    <TableCell className="font-mono text-panel-accent text-xs">{art.id}</TableCell>
                    <TableCell>{art.title}</TableCell>
                    <TableCell>
                      <Chip size="sm" variant="flat" className="capitalize">
                        {art.scope}
                      </Chip>
                    </TableCell>
                    <TableCell className="font-mono text-center">{art.requiredLevel}</TableCell>
                    <TableCell>
                      <StatusBadge
                        tone={
                          art.lifecycleState === 'active'
                            ? 'success'
                            : art.lifecycleState === 'submitted'
                              ? 'warning'
                              : 'danger'
                        }
                      >
                        {art.lifecycleState.toUpperCase()}
                      </StatusBadge>
                    </TableCell>
                    <TableCell className="font-mono">v{art.latestRevision}</TableCell>
                    <TableCell className="text-panel-muted text-xs font-mono">
                      {new Date(art.updatedAt).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </PageContainer>

      {/* Detail Drawer */}
      <Drawer isOpen={drawerOpen} onOpenChange={setDrawerOpen} size="md">
        <DrawerContent className="bg-panel-surface border-l border-panel-line text-panel-text">
          {(onClose) => (
            <>
              <DrawerHeader className="border-b border-panel-line flex flex-col gap-1 p-5">
                <span className="font-mono text-xs text-panel-accent">{selectedArtifact?.id}</span>
                <h2 className="text-xl font-bold">{selectedArtifact?.title}</h2>
              </DrawerHeader>
              <DrawerBody className="p-5 overflow-y-auto space-y-6">
                {detailLoading ? (
                  <div className="space-y-4 py-8 text-center text-panel-muted animate-pulse">
                    Loading detailed metadata...
                  </div>
                ) : selectedArtifact ? (
                  <>
                    {/* Basic Info */}
                    <div className="space-y-3">
                      <h3 className="font-mono text-xs uppercase tracking-wider text-panel-muted border-b border-panel-line/30 pb-1.5">
                        Base Information
                      </h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs text-panel-muted font-medium">Lifecycle State</p>
                          <div className="mt-1">
                            <StatusBadge
                              tone={
                                selectedArtifact.lifecycleState === 'active'
                                  ? 'success'
                                  : selectedArtifact.lifecycleState === 'submitted'
                                    ? 'warning'
                                    : 'danger'
                              }
                            >
                              {selectedArtifact.lifecycleState.toUpperCase()}
                            </StatusBadge>
                          </div>
                        </div>
                        <div>
                          <p className="text-xs text-panel-muted font-medium">Required Level</p>
                          <p className="mt-1 font-mono text-sm">{selectedArtifact.requiredLevel}</p>
                        </div>
                        <div>
                          <p className="text-xs text-panel-muted font-medium">Scope</p>
                          <p className="mt-1 text-sm capitalize">{selectedArtifact.scope}</p>
                        </div>
                        <div>
                          <p className="text-xs text-panel-muted font-medium">Owner</p>
                          <p className="mt-1 text-sm font-mono text-panel-accent">
                            @{selectedArtifact.owner.handle}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Derivation Summary */}
                    <div className="space-y-3">
                      <h3 className="font-mono text-xs uppercase tracking-wider text-panel-muted border-b border-panel-line/30 pb-1.5">
                        Derivation Results
                      </h3>
                      {activeRevision?.derived ? (
                        <div className="space-y-3 bg-[#0a0f1d] border border-panel-line p-4 rounded-xl">
                          <p className="text-sm leading-relaxed">
                            {activeRevision.derived.profile?.summary}
                          </p>
                          <div className="flex gap-4 pt-2 border-t border-panel-line/35 font-mono text-xs text-panel-muted">
                            <div>
                              Capsules:{' '}
                              <span className="text-panel-text font-bold">
                                {activeRevision.derived.capsules.length}
                              </span>
                            </div>
                            <div>
                              References:{' '}
                              <span className="text-panel-text font-bold">
                                {activeRevision.derived.clientManifest?.references.length || 0}
                              </span>
                            </div>
                            <div>
                              Scripts:{' '}
                              <span className="text-panel-text font-bold">
                                {activeRevision.derived.clientManifest?.scripts.length || 0}
                              </span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-panel-muted italic">
                          No computed derivation outputs found for this revision.
                        </p>
                      )}
                    </div>

                    {/* File Manifest */}
                    <div className="space-y-3">
                      <h3 className="font-mono text-xs uppercase tracking-wider text-panel-muted border-b border-panel-line/30 pb-1.5">
                        File Manifest (v{selectedArtifact.latestRevision})
                      </h3>
                      <div className="space-y-2 max-h-[180px] overflow-y-auto divide-y divide-panel-line/20 pr-1">
                        {activeRevision?.files.map((file) => (
                          <div
                            key={file.path}
                            className="flex justify-between py-2 text-xs font-mono"
                          >
                            <span className="text-panel-text truncate pr-4">{file.path}</span>
                            <span className="text-panel-muted shrink-0 capitalize">
                              {file.kind}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Governance Metadata */}
                    <div className="space-y-3">
                      <h3 className="font-mono text-xs uppercase tracking-wider text-panel-muted border-b border-panel-line/30 pb-1.5">
                        Governance Metadata
                      </h3>
                      <div className="grid grid-cols-2 gap-4 text-xs font-mono text-panel-muted">
                        <div>
                          <p>Source Kind</p>
                          <p className="text-panel-text mt-1 capitalize">
                            {selectedArtifact.metadata.sourceKind.replace(/-/g, ' ')}
                          </p>
                        </div>
                        <div>
                          <p>Revision Count</p>
                          <p className="text-panel-text mt-1">
                            {selectedArtifact.metadata.revisionCount}
                          </p>
                        </div>
                        <div>
                          <p>Created At</p>
                          <p className="text-panel-text mt-1">
                            {new Date(selectedArtifact.createdAt).toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <p>Last Reviewed At</p>
                          <p className="text-panel-text mt-1">
                            {selectedArtifact.metadata.latestReviewedAt
                              ? new Date(
                                  selectedArtifact.metadata.latestReviewedAt,
                                ).toLocaleString()
                              : 'n/a'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </>
                ) : null}
              </DrawerBody>
              <DrawerFooter className="border-t border-panel-line p-5 flex gap-3">
                <Button
                  className="flex-1"
                  color="primary"
                  onPress={() => {
                    onClose();
                    navigate(`/skill-graph?artifactId=${selectedArtifact?.id}`);
                  }}
                >
                  View Skill Graph
                </Button>
                <Button
                  className="flex-1"
                  variant="flat"
                  onPress={() => {
                    onClose();
                    navigate('/trap-graph');
                  }}
                >
                  View Trap Graph
                </Button>
              </DrawerFooter>
            </>
          )}
        </DrawerContent>
      </Drawer>
    </PageTransition>
  );
}
