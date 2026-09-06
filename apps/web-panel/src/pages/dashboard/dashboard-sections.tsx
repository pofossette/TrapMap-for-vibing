import { Button, Card, Chip } from '@heroui/react';
import type {
  DashboardGraphStats,
  DashboardScale,
} from '@trapmap/web-panel/features/dashboard/service';
import type { RuntimeOverview, RuntimeServiceStatus } from '@trapmap/web-panel/shared/enum-types';
import { localizeServiceHealth } from '@trapmap/web-panel/shared/lib/display-labels';
import { StatusBadge } from '@trapmap/web-panel/shared/ui';
import { useI18nStore } from '@trapmap/web-panel/stores/i18n-store';
import type { ReactElement, ReactNode } from 'react';

export function DashboardHeader({
  loading,
  onRefresh,
  overview,
}: {
  loading: boolean;
  onRefresh: () => void;
  overview: RuntimeOverview | null;
}): ReactElement {
  const { t } = useI18nStore();

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-panel-line pb-4 select-none">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-panel-text">
          {t('systemDashboard')}
        </h1>
        <p className="text-xs text-panel-muted mt-1">{t('dashboardDesc')}</p>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-4 text-xs font-mono bg-panel-surface border border-panel-line rounded-panel-md px-4 py-2">
          <span className="text-panel-muted">
            {t('dashboardProfile')}:{' '}
            <strong className="text-panel-text">
              {overview?.deploymentProfile ?? 'team-monolith'}
            </strong>
          </span>
          <span className="text-panel-muted">|</span>
          <span className="text-panel-muted">
            {t('dashboardBuild')}:{' '}
            <strong className="text-panel-text">{overview?.buildId ?? 'dev'}</strong>
          </span>
          <span className="text-panel-muted">|</span>
          <span className="text-panel-muted">
            {t('dashboardLastCheck')}:{' '}
            <strong className="text-panel-text">
              {overview?.lastHealthCheckAt
                ? new Date(overview.lastHealthCheckAt).toLocaleTimeString()
                : t('notAvailableShort')}
            </strong>
          </span>
        </div>

        <Button isDisabled={loading} size="sm" variant="secondary" onPress={onRefresh}>
          {loading ? t('refreshing') : t('refreshMetrics')}
        </Button>
      </div>
    </div>
  );
}

function PanelCard({
  children,
  label,
  tone,
}: {
  children: ReactNode;
  label: string;
  tone: 'success' | 'warning';
}): ReactElement {
  const badge = useI18nStore((state) =>
    tone === 'success' ? state.t('runtimeActive') : state.t('actionRequired'),
  );

  return (
    <Card className="border border-panel-line bg-panel-surface p-5 shadow-panel space-y-4">
      <div className="flex items-center justify-between border-b border-panel-line/30 pb-2">
        <h3 className="text-sm font-bold uppercase tracking-wider text-panel-muted">{label}</h3>
        <Chip color={tone} size="sm" variant="soft">
          {badge}
        </Chip>
      </div>
      {children}
    </Card>
  );
}

export function ServiceHealthCard({
  services,
}: {
  services: RuntimeServiceStatus[];
}): ReactElement {
  const { t } = useI18nStore();

  return (
    <PanelCard label={t('serviceHealth')} tone="success">
      <div className="divide-y divide-panel-line/30">
        {services.map((service) => (
          <div
            className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
            key={service.name}
          >
            <div>
              <p className="font-semibold text-sm text-panel-text capitalize">{service.name}</p>
              <p className="text-xs text-panel-muted mt-0.5">{service.detail}</p>
            </div>
            <StatusBadge
              tone={
                service.status === 'healthy'
                  ? 'success'
                  : service.status === 'degraded'
                    ? 'warning'
                    : 'danger'
              }
            >
              {localizeServiceHealth(t, service.status)}
            </StatusBadge>
          </div>
        ))}
        {services.length === 0 && (
          <p className="py-2 text-sm text-panel-muted">{t('noServices')}</p>
        )}
      </div>
    </PanelCard>
  );
}

export function PendingActionsCard({
  onOpenActivity,
  onOpenReviews,
  overview,
}: {
  onOpenActivity: () => void;
  onOpenReviews: () => void;
  overview: RuntimeOverview | null;
}): ReactElement {
  const { t } = useI18nStore();

  return (
    <PanelCard label={t('pendingBacklogs')} tone="warning">
      <div className="space-y-3">
        <div className="flex justify-between items-center bg-panel-bg-deep border border-panel-line/50 p-3.5 rounded-panel-md">
          <div>
            <p className="text-xs text-panel-muted">{t('pendingReviewsShort')}</p>
            <p className="mt-1 text-xl font-bold text-panel-text">
              {overview?.pendingReviewCount ?? 0} {t('itemsUnit')}
            </p>
          </div>
          <Button onPress={onOpenReviews} size="sm" variant="secondary">
            {t('auditQueue')}
          </Button>
        </div>

        <div className="flex justify-between items-center bg-panel-bg-deep border border-panel-line/50 p-3.5 rounded-panel-md">
          <div>
            <p className="text-xs text-panel-muted">{t('failedRuntimeJobs')}</p>
            <p className="mt-1 text-xl font-bold text-panel-danger">
              {overview?.failedJobsCount ?? 0} {t('jobsUnit')}
            </p>
          </div>
          <Button onPress={onOpenActivity} size="sm" variant="danger">
            {t('checkLogs')}
          </Button>
        </div>
      </div>
    </PanelCard>
  );
}

function TrapGraphPreview(): ReactElement {
  return (
    <svg height="110" role="img" viewBox="0 0 220 110" width="220">
      <title>Trap graph preview</title>
      <line stroke="#242424" strokeWidth="1.5" x1="30" x2="110" y1="55" y2="25" />
      <line stroke="#242424" strokeWidth="1.5" x1="30" x2="110" y1="55" y2="85" />
      <line stroke="#242424" strokeWidth="1.5" x1="110" x2="190" y1="25" y2="55" />
      <line stroke="#242424" strokeWidth="1.5" x1="110" x2="190" y1="85" y2="55" />
      <circle cx="30" cy="55" fill="#0a0f1d" r="14" stroke="#eab308" strokeWidth="1.5" />
      <circle cx="110" cy="25" fill="#0a0f1d" r="14" stroke="#f97316" strokeWidth="1.5" />
      <circle cx="110" cy="85" fill="#0a0f1d" r="14" stroke="#7dd3fc" strokeWidth="1.5" />
      <circle cx="190" cy="55" fill="#0a0f1d" r="14" stroke="#10b981" strokeWidth="1.5" />
      <text fill="#fff" fontFamily="monospace" fontSize="8" textAnchor="middle" x="30" y="58">
        Cue
      </text>
      <text fill="#fff" fontFamily="monospace" fontSize="8" textAnchor="middle" x="110" y="28">
        Trap
      </text>
      <text fill="#fff" fontFamily="monospace" fontSize="8" textAnchor="middle" x="110" y="88">
        Tool
      </text>
      <text fill="#fff" fontFamily="monospace" fontSize="8" textAnchor="middle" x="190" y="58">
        Mit
      </text>
    </svg>
  );
}

function SkillGraphPreview(): ReactElement {
  return (
    <svg height="110" role="img" viewBox="0 0 220 110" width="220">
      <title>Skill graph preview</title>
      <line stroke="#242424" strokeWidth="1.5" x1="40" x2="110" y1="25" y2="55" />
      <line stroke="#242424" strokeWidth="1.5" x1="40" x2="110" y1="85" y2="55" />
      <line stroke="#242424" strokeWidth="1.5" x1="110" x2="180" y1="55" y2="25" />
      <line stroke="#242424" strokeWidth="1.5" x1="110" x2="180" y1="55" y2="85" />
      <circle cx="40" cy="25" fill="#0a0f1d" r="14" stroke="#006fee" strokeWidth="1.5" />
      <circle cx="40" cy="85" fill="#0a0f1d" r="14" stroke="#a855f7" strokeWidth="1.5" />
      <circle cx="110" cy="55" fill="#0a0f1d" r="14" stroke="#22c55e" strokeWidth="1.5" />
      <circle cx="180" cy="25" fill="#0a0f1d" r="14" stroke="#737373" strokeWidth="1.5" />
      <circle cx="180" cy="85" fill="#0a0f1d" r="14" stroke="#7dd3fc" strokeWidth="1.5" />
      <text fill="#fff" fontFamily="monospace" fontSize="8" textAnchor="middle" x="40" y="28">
        Art
      </text>
      <text fill="#fff" fontFamily="monospace" fontSize="8" textAnchor="middle" x="40" y="88">
        Prof
      </text>
      <text fill="#fff" fontFamily="monospace" fontSize="8" textAnchor="middle" x="110" y="58">
        Cap
      </text>
      <text fill="#fff" fontFamily="monospace" fontSize="8" textAnchor="middle" x="180" y="28">
        Ref
      </text>
      <text fill="#fff" fontFamily="monospace" fontSize="8" textAnchor="middle" x="180" y="88">
        Scr
      </text>
    </svg>
  );
}

function GraphPreviewCard({
  actionLabel,
  badge,
  badgeColor,
  children,
  onOpen,
  stats,
  title,
}: {
  actionLabel: string;
  badge: string;
  badgeColor: 'warning' | 'accent';
  children: ReactNode;
  onOpen: () => void;
  stats: DashboardGraphStats;
  title: string;
}): ReactElement {
  const { t } = useI18nStore();

  return (
    <Card className="flex flex-col justify-between border border-panel-line bg-panel-surface p-5 shadow-panel">
      <div>
        <div className="flex justify-between items-start border-b border-panel-line/30 pb-3">
          <div>
            <h3 className="text-md font-bold text-panel-text">{title}</h3>
            <p className="mt-1 text-xs text-panel-muted">
              {stats.nodes} {t('nodes')} · {stats.edges} {t('graphRelationships')}
            </p>
          </div>
          <Chip color={badgeColor} size="sm" variant="soft">
            {badge}
          </Chip>
        </div>

        <div className="my-4 flex justify-center items-center rounded-panel-md border border-panel-line/50 bg-panel-bg-deep py-6">
          {children}
        </div>
      </div>

      <div className="flex gap-2">
        <Button className="panel-primary-action flex-1" onPress={onOpen} variant="primary">
          {actionLabel}
        </Button>
      </div>
    </Card>
  );
}

export function TrapGraphCard({
  onOpen,
  stats,
}: {
  onOpen: () => void;
  stats: DashboardGraphStats;
}): ReactElement {
  const { t } = useI18nStore();

  return (
    <GraphPreviewCard
      actionLabel={t('interactiveDebug')}
      badge={t('topology')}
      badgeColor="warning"
      onOpen={onOpen}
      stats={stats}
      title={t('trapGraphOverview')}
    >
      <TrapGraphPreview />
    </GraphPreviewCard>
  );
}

export function SkillGraphCard({
  onOpen,
  stats,
}: {
  onOpen: () => void;
  stats: DashboardGraphStats;
}): ReactElement {
  const { t } = useI18nStore();

  return (
    <GraphPreviewCard
      actionLabel={t('auditDerivation')}
      badge={t('derivation')}
      badgeColor="accent"
      onOpen={onOpen}
      stats={stats}
      title={t('skillGraphOverview')}
    >
      <SkillGraphPreview />
    </GraphPreviewCard>
  );
}

function ScaleItem({ label, value }: { label: string; value: number }): ReactElement {
  return (
    <div className="rounded-panel-md border border-panel-line/50 bg-panel-bg-deep p-4 text-center">
      <p className="text-xs text-panel-muted">{label}</p>
      <p className="mt-1.5 text-2xl font-bold text-panel-text">{value.toLocaleString()}</p>
    </div>
  );
}

export function KnowledgeScaleCard({ scale }: { scale: DashboardScale | null }): ReactElement {
  const { t } = useI18nStore();

  return (
    <Card className="border border-panel-line bg-panel-surface p-5 shadow-panel space-y-4">
      <h3 className="border-b border-panel-line/30 pb-2 text-sm font-bold uppercase tracking-wider text-panel-muted">
        {t('knowledgeScaleIndex')}
      </h3>
      <div className="grid gap-4 sm:grid-cols-3">
        <ScaleItem label={t('totalTraps')} value={scale?.traps ?? 0} />
        <ScaleItem label={t('skillArtifactsCount')} value={scale?.skillArtifacts ?? 0} />
        <ScaleItem label={t('capsules')} value={scale?.capsules ?? 0} />
      </div>
    </Card>
  );
}

export function IncidentsCard({ incidents }: { incidents: string[] }): ReactElement {
  const { t } = useI18nStore();

  return (
    <Card className="border border-panel-line bg-panel-surface p-5 shadow-panel space-y-4">
      <h3 className="border-b border-panel-line/30 pb-2 text-sm font-bold uppercase tracking-wider text-panel-muted">
        {t('activeIncidents')}
      </h3>
      <div className="space-y-3">
        {incidents.map((incident) => (
          <div
            className="flex items-center gap-2.5 rounded-panel-md border border-danger/20 bg-danger/10 p-3 text-xs leading-relaxed text-danger"
            key={incident}
          >
            <span className="h-2 w-2 shrink-0 rounded-full bg-danger" />
            <span>{incident}</span>
          </div>
        ))}
        {incidents.length === 0 && (
          <div className="flex items-center gap-2 py-3 text-xs font-medium text-success">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            {t('allClear')}
          </div>
        )}
      </div>
    </Card>
  );
}
