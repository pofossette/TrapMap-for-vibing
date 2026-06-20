import { toast } from '@heroui/react';
import type { ReactElement } from 'react';
import { Link } from 'react-router-dom';

import { useDashboardPageModel } from '@trapmap/web-panel/features/dashboard/use-dashboard-page-model';
import { FadeIn, PageTransition } from '@trapmap/web-panel/shared/motion';
import {
  ErrorPanel,
  PageContainer,
  SectionHeader,
  SkeletonBlock,
  StatusBadge,
  SummaryCard,
} from '@trapmap/web-panel/shared/ui';
import { useI18nStore } from '@trapmap/web-panel/stores/i18n-store';

export function DashboardPage(): ReactElement {
  const model = useDashboardPageModel();
  const { t } = useI18nStore();

  if (model.error) {
    return (
      <PageTransition className="space-y-6">
        <SectionHeader title={t('dashboard')} />
        <ErrorPanel message={model.error} onRetry={() => void model.refresh()} />
      </PageTransition>
    );
  }

  return (
    <PageTransition className="space-y-6">
      <PageContainer>
        {/* Page title and refresh action */}
        <SectionHeader
          description={t('dashboardDesc')}
          title={t('systemDashboard')}
          actions={
            <button
              className="rounded-full border border-panel-line bg-panel-elevated px-4 py-2 text-sm font-semibold hover:bg-panel-elevated/80 transition cursor-pointer select-none"
              disabled={model.loading}
              onClick={async () => {
                const success = await model.refresh();
                if (success) {
                  toast.success(t('metricsRefreshed'));
                } else {
                  toast.danger(t('metricsRefreshFailed'));
                }
              }}
              type="button"
            >
              {model.loading ? t('refreshing') : t('refreshMetrics')}
            </button>
          }
        />

        {/* Loading state skeleton */}
        {model.loading && model.cards.length === 0 ? (
          <div className="space-y-6">
            <SkeletonBlock count={4} variant="card" />
            <SkeletonBlock count={5} variant="line" />
          </div>
        ) : (
          <div className="space-y-6">
            <section className="relative overflow-hidden rounded-2xl border border-panel-line bg-panel-surface p-6 shadow-panel">
              <div className="pointer-events-none absolute inset-y-0 right-0 w-[40%] bg-[radial-gradient(circle_at_center,#00dfd822_0%,#7928ca14_42%,#ff008010_70%,transparent_100%)]" />
              <div className="relative grid gap-6 lg:grid-cols-[1.45fr,0.9fr]">
                <div className="space-y-4">
                  <span className="inline-flex rounded-full border border-panel-line bg-panel-surface px-3 py-1 font-mono text-[12px] font-medium uppercase text-panel-muted">
                    {t('runtimeSnapshot')}
                  </span>
                  <div>
                    <h3 className="text-[48px] font-semibold leading-[48px] tracking-[-2.4px] text-panel-text">
                      {t('supervisionTitle')}
                    </h3>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-panel-muted">
                      {t('supervisionDesc')}
                    </p>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                  <div className="rounded-xl border border-panel-line bg-panel-surface-strong p-4">
                    <p className="font-mono text-[12px] font-medium uppercase text-panel-muted">
                      {t('buildLabel')}
                    </p>
                    <p className="mt-2 text-lg font-semibold text-panel-text">
                      {model.overview?.buildId ?? 'web-panel-dev'}
                    </p>
                  </div>
                  <div className="rounded-xl border border-panel-line bg-panel-surface-strong p-4">
                    <p className="font-mono text-[12px] font-medium uppercase text-panel-muted">
                      Profile
                    </p>
                    <p className="mt-2 text-lg font-semibold text-panel-text">
                      {model.overview?.deploymentProfile ?? 'team-monolith'}
                    </p>
                  </div>
                  <div className="rounded-xl border border-panel-line bg-panel-surface-strong p-4">
                    <p className="font-mono text-[12px] font-medium uppercase text-panel-muted">
                      {t('lastCheck')}
                    </p>
                    <p className="mt-2 text-lg font-semibold text-panel-text">
                      {model.overview?.lastHealthCheckAt ?? 'n/a'}
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* Summary metrics cards grid */}
            <FadeIn>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {model.cards.map((card) => (
                  <SummaryCard
                    badge={<StatusBadge tone={card.tone}>{card.badge}</StatusBadge>}
                    helpText={card.helpText}
                    key={card.label}
                    label={card.label}
                    value={card.value}
                  />
                ))}
              </div>
            </FadeIn>

            {/* Core Info panels layout */}
            <div className="grid gap-6 lg:grid-cols-3">
              {/* Service Health detailed panel */}
              <div className="lg:col-span-2 rounded-2xl border border-panel-line bg-panel-surface p-5 shadow-panel space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold text-panel-text">{t('serviceHealth')}</h3>
                  <span className="font-mono text-[12px] font-medium uppercase text-panel-muted">
                    {model.services.length} {t('servicesCount')}
                  </span>
                </div>
                <div className="divide-y divide-panel-line/40">
                  {model.services.map((service) => (
                    <div
                      className="grid gap-4 py-4 first:pt-0 last:pb-0 md:grid-cols-[1.2fr,0.7fr]"
                      key={service.name}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-panel-text">
                            {service.name}
                          </span>
                          <span className="rounded-full border border-panel-line bg-panel-surface px-2 py-0.5 font-mono text-[12px] text-panel-muted">
                            v{service.version}
                          </span>
                        </div>
                        <p className="text-sm leading-6 text-panel-muted">{service.detail}</p>
                      </div>
                      <div className="rounded-xl border border-panel-line bg-panel-surface-strong px-4 py-3 text-left md:text-right">
                        <StatusBadge
                          tone={
                            service.status === 'healthy'
                              ? 'success'
                              : service.status === 'degraded'
                                ? 'warning'
                                : 'danger'
                          }
                        >
                          {(service.status === 'healthy'
                            ? t('badgeHealthy')
                            : service.status === 'degraded'
                              ? t('badgeWatch')
                              : service.status
                          ).toUpperCase()}
                        </StatusBadge>
                        <p className="mt-2 text-[11px] text-panel-muted">
                          {t('checkedAt')} {service.lastCheckedAt}
                        </p>
                      </div>
                    </div>
                  ))}
                  {model.services.length === 0 && (
                    <p className="text-sm text-panel-muted py-2">{t('noServices')}</p>
                  )}
                </div>
              </div>

              {/* Quick links & Incident summary panel */}
              <div className="space-y-6">
                {/* Governance quick links */}
                <div className="rounded-2xl border border-panel-line bg-panel-surface p-5 shadow-panel space-y-4">
                  <h3 className="text-lg font-semibold text-panel-text">{t('quickActions')}</h3>
                  <div className="flex flex-col gap-2">
                    <Link
                      className="group flex items-center justify-between rounded-xl border border-panel-line bg-panel-surface-strong p-4 text-sm font-medium transition hover:border-panel-line-strong"
                      to="/reviews"
                    >
                      <div>
                        <p className="font-semibold text-panel-text">{t('reviewGovQueue')}</p>
                        <p className="mt-1 text-xs text-panel-muted">{t('reviewGovQueueDesc')}</p>
                      </div>
                      <svg
                        role="img"
                        aria-label="Arrow"
                        className="h-4 w-4 text-panel-muted transition group-hover:translate-x-0.5 group-hover:text-panel-text"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <title>Arrow Right</title>
                        <path
                          d="M9 5l7 7-7 7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                        />
                      </svg>
                    </Link>
                    <Link
                      className="group flex items-center justify-between rounded-xl border border-panel-line bg-panel-surface-strong p-4 text-sm font-medium transition hover:border-panel-line-strong"
                      to="/activity"
                    >
                      <div>
                        <p className="font-semibold text-panel-text">{t('auditLogs')}</p>
                        <p className="mt-1 text-xs text-panel-muted">{t('auditLogsDesc')}</p>
                      </div>
                      <svg
                        role="img"
                        aria-label="Arrow"
                        className="h-4 w-4 text-panel-muted transition group-hover:translate-x-0.5 group-hover:text-panel-text"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <title>Arrow Right</title>
                        <path
                          d="M9 5l7 7-7 7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                        />
                      </svg>
                    </Link>
                  </div>
                </div>

                {/* Warnings / Incidents summary panel */}
                <div className="rounded-2xl border border-panel-line bg-panel-surface p-5 shadow-panel space-y-4">
                  <h3 className="text-lg font-semibold text-panel-text">{t('activeIncidents')}</h3>
                  <div className="space-y-3">
                    {model.incidents.map((incident) => (
                      <div
                        className="rounded-2xl border border-rose-500/20 bg-rose-500/8 p-4 text-sm leading-6 text-rose-100"
                        key={incident}
                      >
                        {incident}
                      </div>
                    ))}
                    {model.incidents.length === 0 && (
                      <div className="flex items-center gap-2 text-xs text-emerald-400 font-medium">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        {t('allClear')}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </PageContainer>
    </PageTransition>
  );
}
