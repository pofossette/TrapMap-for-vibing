import { Button, Chip } from '@heroui/react';
import { type ReactElement, useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import type { SkillArtifact } from '@trapmap/contracts';
import { getAdminPanelApi } from '@trapmap/web-panel/services/admin-panel-service-context';
import type { ArtifactQuery } from '@trapmap/web-panel/shared/enum-types';
import { localizeLifecycleState } from '@trapmap/web-panel/shared/lib/display-labels';
import { PageTransition } from '@trapmap/web-panel/shared/motion';
import { PageContainer, SectionHeader, StatusBadge } from '@trapmap/web-panel/shared/ui';
import { useI18nStore } from '@trapmap/web-panel/stores/i18n-store';

const ARTIFACT_PAGE_LIMIT = 20;

function buildArtifactPageQuery(
  search: string,
  lifecycleState: string,
  scope: string,
  requiredLevel: string,
  cursor: string | null,
): ArtifactQuery {
  return {
    ...(cursor ? { cursor } : {}),
    ...(lifecycleState !== 'all' ? { lifecycleState } : {}),
    limit: ARTIFACT_PAGE_LIMIT,
    ...(scope !== 'all' ? { scope } : {}),
    ...(requiredLevel !== 'all' ? { requiredLevel: Number.parseInt(requiredLevel, 10) } : {}),
    ...(search.trim() ? { search: search.trim() } : {}),
  };
}

function lifecycleTone(state: SkillArtifact['lifecycleState']): 'success' | 'warning' | 'danger' {
  return state === 'approved'
    ? 'success'
    : state === 'submitted' || state === 'agent-pass'
      ? 'warning'
      : 'danger';
}

function ArtifactFilters({
  search,
  onSearchChange,
  lifecycleState,
  onLifecycleStateChange,
  scope,
  onScopeChange,
  requiredLevel,
  onRequiredLevelChange,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  lifecycleState: string;
  onLifecycleStateChange: (value: string) => void;
  scope: string;
  onScopeChange: (value: string) => void;
  requiredLevel: string;
  onRequiredLevelChange: (value: string) => void;
}): ReactElement {
  const { t } = useI18nStore();
  return (
    <div className="grid gap-4 md:grid-cols-4 bg-panel-surface border border-panel-line rounded-panel-lg p-4">
      <input
        className="w-full rounded-xl border border-panel-line bg-panel-surface px-3 py-2 text-sm text-panel-text outline-none"
        placeholder={t('artifactSearchPlaceholder')}
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
      />

      <select
        className="w-full rounded-xl border border-panel-line bg-panel-surface px-3 py-2 text-sm text-panel-text outline-none"
        value={lifecycleState}
        onChange={(event) => onLifecycleStateChange(event.target.value)}
      >
        <option value="all">{t('allStates')}</option>
        <option value="approved">{t('approved')}</option>
        <option value="submitted">{t('submitted')}</option>
        <option value="draft">{t('draft')}</option>
      </select>

      <select
        className="w-full rounded-xl border border-panel-line bg-panel-surface px-3 py-2 text-sm text-panel-text outline-none"
        value={scope}
        onChange={(event) => onScopeChange(event.target.value)}
      >
        <option value="all">{t('allScopes')}</option>
        <option value="global">{t('globalScope')}</option>
        <option value="project">{t('projectScope')}</option>
      </select>

      <select
        aria-label={t('requiredLevel')}
        className="w-full rounded-xl border border-panel-line bg-panel-surface px-3 py-2 text-sm text-panel-text outline-none"
        value={requiredLevel}
        onChange={(event) => onRequiredLevelChange(event.target.value)}
      >
        <option value="all">{t('allLevels')}</option>
        {[1, 2, 3, 4, 5].map((level) => (
          <option key={level} value={String(level)}>
            {`${level} - ${level <= 2 ? t('lowRisk') : level === 3 ? t('mediumRisk') : t('highRisk')}`}
          </option>
        ))}
      </select>
    </div>
  );
}

function ArtifactTable({
  artifacts,
  loading,
  error,
  onRetry,
  onRowClick,
}: {
  artifacts: SkillArtifact[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onRowClick: (artifact: SkillArtifact) => void;
}): ReactElement {
  const { t } = useI18nStore();
  return (
    <>
      {error ? (
        <div className="p-6 text-center border border-panel-line rounded-2xl bg-panel-surface">
          <p className="text-rose-400 font-semibold">{error}</p>
          <Button className="mt-4" size="sm" variant="secondary" onPress={onRetry}>
            {t('retry')}
          </Button>
        </div>
      ) : (
        <div className="border border-panel-line rounded-2xl bg-panel-surface overflow-hidden">
          {loading ? (
            <div className="p-6 text-sm text-panel-muted">{t('loadingArtifacts')}</div>
          ) : artifacts.length === 0 ? (
            <div className="p-6 text-sm text-panel-muted">{t('noGovernedArtifacts')}</div>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead className="bg-panel-surface-strong text-panel-muted font-mono text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="border-b border-panel-line px-4 py-3 text-left">ID</th>
                  <th className="border-b border-panel-line px-4 py-3 text-left">
                    {t('titleLabel')}
                  </th>
                  <th className="border-b border-panel-line px-4 py-3 text-left">{t('scope')}</th>
                  <th className="border-b border-panel-line px-4 py-3 text-left">
                    {t('requiredLevel')}
                  </th>
                  <th className="border-b border-panel-line px-4 py-3 text-left">{t('state')}</th>
                  <th className="border-b border-panel-line px-4 py-3 text-left">
                    {t('revision')}
                  </th>
                  <th className="border-b border-panel-line px-4 py-3 text-left">
                    {t('updatedAt')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {artifacts.map((art) => (
                  <tr
                    key={art.id}
                    className="border-b border-panel-line/30 transition hover:bg-panel-surface-strong"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-panel-accent">
                      <button
                        type="button"
                        className="text-left text-inherit"
                        onClick={() => onRowClick(art)}
                      >
                        {art.id}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-panel-text">
                      <button
                        type="button"
                        className="text-left text-inherit"
                        onClick={() => onRowClick(art)}
                      >
                        {art.title}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <Chip size="sm" variant="soft" className="capitalize">
                        {art.scope === 'global' ? t('globalScope') : t('projectScope')}
                      </Chip>
                    </td>
                    <td className="px-4 py-3 text-center font-mono">{art.requiredLevel}</td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={lifecycleTone(art.lifecycleState)}>
                        {localizeLifecycleState(t, art.lifecycleState)}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3 font-mono">v{art.latestRevision}</td>
                    <td className="px-4 py-3 text-xs font-mono text-panel-muted">
                      {new Date(art.updatedAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </>
  );
}

type ArtifactRevision = SkillArtifact['history'][number];

function ArtifactDrawerHeader({
  artifact,
  onClose,
}: {
  artifact: SkillArtifact | null;
  onClose: () => void;
}): ReactElement {
  const { t } = useI18nStore();
  return (
    <div className="border-b border-panel-line p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-xs text-panel-accent">{artifact?.id}</span>
          <h2 className="text-xl font-bold">{artifact?.title}</h2>
        </div>
        <Button variant="tertiary" onPress={onClose}>
          {t('artifactDetailsClose')}
        </Button>
      </div>
    </div>
  );
}

function ArtifactBasicInfo({ artifact }: { artifact: SkillArtifact }): ReactElement {
  const { t } = useI18nStore();
  return (
    <div className="space-y-3">
      <h3 className="font-mono text-xs uppercase tracking-wider text-panel-muted border-b border-panel-line/30 pb-1.5">
        {t('baseInformation')}
      </h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-panel-muted font-medium">{t('lifecycleState')}</p>
          <div className="mt-1">
            <StatusBadge tone={lifecycleTone(artifact.lifecycleState)}>
              {localizeLifecycleState(t, artifact.lifecycleState)}
            </StatusBadge>
          </div>
        </div>
        <div>
          <p className="text-xs text-panel-muted font-medium">{t('requiredLevel')}</p>
          <p className="mt-1 font-mono text-sm">{artifact.requiredLevel}</p>
        </div>
        <div>
          <p className="text-xs text-panel-muted font-medium">{t('scope')}</p>
          <p className="mt-1 text-sm capitalize">
            {artifact.scope === 'global' ? t('globalScope') : t('projectScope')}
          </p>
        </div>
        <div>
          <p className="text-xs text-panel-muted font-medium">{t('owner')}</p>
          <p className="mt-1 text-sm font-mono text-panel-accent">@{artifact.owner.handle}</p>
        </div>
      </div>
    </div>
  );
}

function ArtifactDerivationSummary({
  activeRevision,
}: {
  activeRevision: ArtifactRevision | undefined;
}): ReactElement {
  const { t } = useI18nStore();
  return (
    <div className="space-y-3">
      <h3 className="font-mono text-xs uppercase tracking-wider text-panel-muted border-b border-panel-line/30 pb-1.5">
        {t('derivationResults')}
      </h3>
      {activeRevision?.derived ? (
        <div className="space-y-3 bg-[#0a0f1d] border border-panel-line p-4 rounded-xl">
          <p className="text-sm leading-relaxed">{activeRevision.derived.profile?.summary}</p>
          <div className="flex gap-4 pt-2 border-t border-panel-line/35 font-mono text-xs text-panel-muted">
            <div>
              {t('capsulesLabel')}:{' '}
              <span className="text-panel-text font-bold">
                {activeRevision.derived.capsules.length}
              </span>
            </div>
            <div>
              {t('referencesLabel')}:{' '}
              <span className="text-panel-text font-bold">
                {activeRevision.derived.clientManifest?.references.length || 0}
              </span>
            </div>
            <div>
              {t('scriptsLabel')}:{' '}
              <span className="text-panel-text font-bold">
                {activeRevision.derived.clientManifest?.scripts.length || 0}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-panel-muted italic">{t('noDerivationOutputs')}</p>
      )}
    </div>
  );
}

function ArtifactFileManifest({
  activeRevision,
  latestRevision,
}: {
  activeRevision: ArtifactRevision | undefined;
  latestRevision: number;
}): ReactElement {
  const { t } = useI18nStore();
  return (
    <div className="space-y-3">
      <h3 className="font-mono text-xs uppercase tracking-wider text-panel-muted border-b border-panel-line/30 pb-1.5">
        {t('fileManifest')} (v{latestRevision})
      </h3>
      <div className="space-y-2 max-h-[180px] overflow-y-auto divide-y divide-panel-line/20 pr-1">
        {activeRevision?.files.map((file) => (
          <div key={file.path} className="flex justify-between py-2 text-xs font-mono">
            <span className="text-panel-text truncate pr-4">{file.path}</span>
            <span className="text-panel-muted shrink-0 capitalize">{file.kind}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ArtifactGovernanceMetadata({ artifact }: { artifact: SkillArtifact }): ReactElement {
  const { t } = useI18nStore();
  return (
    <div className="space-y-3">
      <h3 className="font-mono text-xs uppercase tracking-wider text-panel-muted border-b border-panel-line/30 pb-1.5">
        {t('governanceMetadata')}
      </h3>
      <div className="grid grid-cols-2 gap-4 text-xs font-mono text-panel-muted">
        <div>
          <p>{t('sourceKind')}</p>
          <p className="text-panel-text mt-1 capitalize">
            {artifact.metadata.sourceKind.replace(/-/g, ' ')}
          </p>
        </div>
        <div>
          <p>{t('revisionCount')}</p>
          <p className="text-panel-text mt-1">{artifact.metadata.revisionCount}</p>
        </div>
        <div>
          <p>{t('createdAt')}</p>
          <p className="text-panel-text mt-1">{new Date(artifact.createdAt).toLocaleString()}</p>
        </div>
        <div>
          <p>{t('lastReviewedAt')}</p>
          <p className="text-panel-text mt-1">
            {artifact.metadata.latestReviewedAt
              ? new Date(artifact.metadata.latestReviewedAt).toLocaleString()
              : t('notReviewedYet')}
          </p>
        </div>
      </div>
    </div>
  );
}

function ArtifactDetailDrawer({
  open,
  artifact,
  loading,
  onClose,
  onOpenSkillGraph,
  onOpenTrapGraph,
}: {
  open: boolean;
  artifact: SkillArtifact | null;
  loading: boolean;
  onClose: () => void;
  onOpenSkillGraph: () => void;
  onOpenTrapGraph: () => void;
}): ReactElement {
  const { t } = useI18nStore();
  const activeRevision = artifact?.history.find((h) => h.revision === artifact.latestRevision);

  return (
    <>
      {open ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/20 backdrop-blur-sm">
          <button
            type="button"
            aria-label={t('closeArtifactDetails')}
            className="flex-1"
            onClick={onClose}
          />
          <div className="flex h-full w-full max-w-xl flex-col border-l border-panel-line bg-panel-surface text-panel-text shadow-2xl">
            <ArtifactDrawerHeader artifact={artifact} onClose={onClose} />
            <div className="flex-1 space-y-6 overflow-y-auto p-5">
              {loading ? (
                <div className="space-y-4 py-8 text-center text-panel-muted animate-pulse">
                  {t('loadingDetailedMetadata')}
                </div>
              ) : artifact ? (
                <>
                  {/* Basic Info */}
                  <ArtifactBasicInfo artifact={artifact} />

                  {/* Derivation Summary */}
                  <ArtifactDerivationSummary activeRevision={activeRevision} />

                  {/* File Manifest */}
                  <ArtifactFileManifest
                    activeRevision={activeRevision}
                    latestRevision={artifact.latestRevision}
                  />

                  {/* Governance Metadata */}
                  <ArtifactGovernanceMetadata artifact={artifact} />
                </>
              ) : null}
            </div>
            <div className="flex gap-3 border-t border-panel-line p-5">
              <Button className="flex-1" variant="primary" onPress={onOpenSkillGraph}>
                {t('skillGraph')}
              </Button>
              <Button className="flex-1" variant="secondary" onPress={onOpenTrapGraph}>
                {t('trapGraph')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function ArtifactsPage(): ReactElement {
  const { t } = useI18nStore();
  const navigate = useNavigate();

  const [artifacts, setArtifacts] = useState<SkillArtifact[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paging, setPaging] = useState({
    filteredTotal: 0,
    nextCursor: null as string | null,
    total: 0,
  });

  // Filters state
  const [search, setSearch] = useState('');
  const [lifecycleState, setLifecycleState] = useState('all');
  const [scope, setScope] = useState('all');
  const [requiredLevel, setRequiredLevel] = useState('all');

  // Detail Drawer state
  const [selectedArtifact, setSelectedArtifact] = useState<SkillArtifact | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const fetchArtifacts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getAdminPanelApi().loadArtifacts(
        buildArtifactPageQuery(search, lifecycleState, scope, requiredLevel, cursor),
      );
      setArtifacts(response.items);
      setPaging({
        filteredTotal: response.filteredTotal,
        nextCursor: response.nextCursor,
        total: response.total,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load artifacts');
    } finally {
      setLoading(false);
    }
  }, [cursor, lifecycleState, requiredLevel, scope, search]);

  useEffect(() => {
    void fetchArtifacts();
  }, [fetchArtifacts]);

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

  const openSkillGraph = () => {
    setDrawerOpen(false);
    navigate(`/skill-graph?artifactId=${selectedArtifact?.id}`);
  };

  const openTrapGraph = () => {
    setDrawerOpen(false);
    navigate('/trap-graph');
  };

  return (
    <PageTransition className="space-y-6">
      <PageContainer>
        <SectionHeader title={t('artifacts')} description={t('artifactsDesc')} />

        {/* Filters bar */}
        <ArtifactFilters
          search={search}
          onSearchChange={(value) => {
            setSearch(value);
            setCursor(null);
          }}
          lifecycleState={lifecycleState}
          onLifecycleStateChange={(value) => {
            setLifecycleState(value);
            setCursor(null);
          }}
          scope={scope}
          onScopeChange={(value) => {
            setScope(value);
            setCursor(null);
          }}
          requiredLevel={requiredLevel}
          onRequiredLevelChange={(value) => {
            setRequiredLevel(value);
            setCursor(null);
          }}
        />

        {!loading && (
          <p className="px-1 font-mono text-xs text-panel-muted">
            {paging.filteredTotal} / {paging.total} {t('artifactsResult')}
          </p>
        )}

        {/* Artifacts Table */}
        <ArtifactTable
          artifacts={artifacts}
          loading={loading}
          error={error}
          onRetry={() => void fetchArtifacts()}
          onRowClick={(artifact) => void handleRowClick(artifact)}
        />

        {!loading && artifacts.length > 0 && (
          <nav className="flex items-center justify-between gap-3">
            <Button
              isDisabled={cursor === null}
              variant="secondary"
              onPress={() => {
                const offset = Number.parseInt(cursor ?? '0', 10);
                const previous = offset - ARTIFACT_PAGE_LIMIT;
                setCursor(previous > 0 ? String(previous) : null);
              }}
            >
              {t('previousPage')}
            </Button>
            <Button
              isDisabled={paging.nextCursor === null}
              variant="secondary"
              onPress={() => setCursor(paging.nextCursor)}
            >
              {t('nextPage')}
            </Button>
          </nav>
        )}
      </PageContainer>

      {/* Detail Drawer */}
      <ArtifactDetailDrawer
        open={drawerOpen}
        artifact={selectedArtifact}
        loading={detailLoading}
        onClose={() => setDrawerOpen(false)}
        onOpenSkillGraph={openSkillGraph}
        onOpenTrapGraph={openTrapGraph}
      />
    </PageTransition>
  );
}
