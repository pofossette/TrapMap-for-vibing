import { Button, Card, Chip, toast } from '@heroui/react';
import type { ReactElement } from 'react';
import { Link, useNavigate } from 'react-router-dom';

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
  const navigate = useNavigate();

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
        {/* Topbar Summary Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-panel-line pb-4 select-none">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-panel-text">
              {t('systemDashboard')}
            </h1>
            <p className="text-xs text-panel-muted mt-1">{t('dashboardDesc')}</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-4 text-xs font-mono bg-panel-surface border border-panel-line rounded-xl px-4 py-2">
              <span className="text-panel-muted">
                PROFILE:{' '}
                <strong className="text-panel-text">
                  {model.overview?.deploymentProfile ?? 'team-monolith'}
                </strong>
              </span>
              <span className="text-panel-muted">|</span>
              <span className="text-panel-muted">
                BUILD:{' '}
                <strong className="text-panel-text">{model.overview?.buildId ?? 'dev'}</strong>
              </span>
              <span className="text-panel-muted">|</span>
              <span className="text-panel-muted">
                LAST CHECK:{' '}
                <strong className="text-panel-text">
                  {model.overview?.lastHealthCheckAt
                    ? new Date(model.overview.lastHealthCheckAt).toLocaleTimeString()
                    : 'n/a'}
                </strong>
              </span>
            </div>

            <Button
              size="sm"
              variant="flat"
              disabled={model.loading}
              onPress={async () => {
                const success = await model.refresh();
                if (success) {
                  toast.success(t('metricsRefreshed'));
                } else {
                  toast.danger(t('metricsRefreshFailed'));
                }
              }}
            >
              {model.loading ? t('refreshing') : t('refreshMetrics')}
            </Button>
          </div>
        </div>

        {/* Loading skeleton */}
        {model.loading && model.cards.length === 0 ? (
          <div className="space-y-6">
            <SkeletonBlock count={4} variant="card" />
            <SkeletonBlock count={5} variant="line" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Split layout: Left Health/Pending Tasks, Right Interactive Graph Previews */}
            <div className="grid gap-6 lg:grid-cols-[4.5fr,7.5fr]">
              {/* Left Column: Health and Tasks */}
              <div className="space-y-6">
                {/* Health integration Status */}
                <Card className="border border-panel-line bg-panel-surface p-5 shadow-panel space-y-4">
                  <div className="flex items-center justify-between border-b border-panel-line/30 pb-2">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-panel-muted">
                      {t('serviceHealth')}
                    </h3>
                    <Chip size="sm" variant="flat" color="success">
                      Running
                    </Chip>
                  </div>

                  <div className="divide-y divide-panel-line/30">
                    {model.services.map((service) => (
                      <div
                        className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                        key={service.name}
                      >
                        <div>
                          <p className="font-semibold text-sm text-panel-text capitalize">
                            {service.name}
                          </p>
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
                          {service.status.toUpperCase()}
                        </StatusBadge>
                      </div>
                    ))}
                    {model.services.length === 0 && (
                      <p className="text-sm text-panel-muted py-2">{t('noServices')}</p>
                    )}
                  </div>
                </Card>

                {/* Pending Actions Workload */}
                <Card className="border border-panel-line bg-panel-surface p-5 shadow-panel space-y-4">
                  <div className="flex items-center justify-between border-b border-panel-line/30 pb-2">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-panel-muted">
                      Pending Backlogs
                    </h3>
                    <Chip size="sm" variant="flat" color="warning">
                      Action Needed
                    </Chip>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between items-center bg-[#0a0f1d] border border-panel-line/50 p-3.5 rounded-xl">
                      <div>
                        <p className="text-xs text-panel-muted">Pending Reviews</p>
                        <p className="text-xl font-bold text-panel-text mt-1">18 items</p>
                      </div>
                      <Button size="sm" color="warning" onPress={() => navigate('/reviews')}>
                        Audit Queue
                      </Button>
                    </div>

                    <div className="flex justify-between items-center bg-[#0a0f1d] border border-panel-line/50 p-3.5 rounded-xl">
                      <div>
                        <p className="text-xs text-panel-muted">Failed Runtime Jobs</p>
                        <p className="text-xl font-bold text-rose-400 mt-1">2 jobs</p>
                      </div>
                      <Button
                        size="sm"
                        color="danger"
                        variant="flat"
                        onPress={() => navigate('/activity')}
                      >
                        Check Logs
                      </Button>
                    </div>
                  </div>
                </Card>
              </div>

              {/* Right Column: Interactive Graph Previews */}
              <div className="grid gap-6 sm:grid-cols-2">
                {/* Trap Graph Preview Card */}
                <Card className="border border-panel-line bg-panel-surface p-5 shadow-panel flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start border-b border-panel-line/30 pb-3">
                      <div>
                        <h3 className="text-md font-bold text-panel-text">Trap Graph Overview</h3>
                        <p className="text-xs text-panel-muted mt-1">9 nodes · 8 relationships</p>
                      </div>
                      <Chip size="sm" color="warning" variant="flat">
                        Topology
                      </Chip>
                    </div>

                    {/* SVG Graphic representation of Trap Graph */}
                    <div className="flex justify-center items-center py-6 bg-[#060a13] border border-panel-line/50 rounded-xl my-4">
                      <svg width="220" height="110" viewBox="0 0 220 110" role="img">
                        <title>Trap graph preview</title>
                        <line x1="30" y1="55" x2="110" y2="25" stroke="#242424" strokeWidth="1.5" />
                        <line x1="30" y1="55" x2="110" y2="85" stroke="#242424" strokeWidth="1.5" />
                        <line
                          x1="110"
                          y1="25"
                          x2="190"
                          y2="55"
                          stroke="#242424"
                          strokeWidth="1.5"
                        />
                        <line
                          x1="110"
                          y1="85"
                          x2="190"
                          y2="55"
                          stroke="#242424"
                          strokeWidth="1.5"
                        />

                        <circle
                          cx="30"
                          cy="55"
                          r="14"
                          fill="#0a0f1d"
                          stroke="#eab308"
                          strokeWidth="1.5"
                        />
                        <circle
                          cx="110"
                          cy="25"
                          r="14"
                          fill="#0a0f1d"
                          stroke="#f97316"
                          strokeWidth="1.5"
                        />
                        <circle
                          cx="110"
                          cy="85"
                          r="14"
                          fill="#0a0f1d"
                          stroke="#7dd3fc"
                          strokeWidth="1.5"
                        />
                        <circle
                          cx="190"
                          cy="55"
                          r="14"
                          fill="#0a0f1d"
                          stroke="#10b981"
                          strokeWidth="1.5"
                        />

                        <text
                          x="30"
                          y="58"
                          fill="#fff"
                          fontSize="8"
                          textAnchor="middle"
                          fontFamily="monospace"
                        >
                          Cue
                        </text>
                        <text
                          x="110"
                          y="28"
                          fill="#fff"
                          fontSize="8"
                          textAnchor="middle"
                          fontFamily="monospace"
                        >
                          Trap
                        </text>
                        <text
                          x="110"
                          y="88"
                          fill="#fff"
                          fontSize="8"
                          textAnchor="middle"
                          fontFamily="monospace"
                        >
                          Tool
                        </text>
                        <text
                          x="190"
                          y="58"
                          fill="#fff"
                          fontSize="8"
                          textAnchor="middle"
                          fontFamily="monospace"
                        >
                          Mit
                        </text>
                      </svg>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      className="flex-1"
                      color="primary"
                      onPress={() => navigate('/trap-graph')}
                    >
                      Interactive Debug
                    </Button>
                  </div>
                </Card>

                {/* Skill Graph Preview Card */}
                <Card className="border border-panel-line bg-panel-surface p-5 shadow-panel flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start border-b border-panel-line/30 pb-3">
                      <div>
                        <h3 className="text-md font-bold text-panel-text">Skill Graph Overview</h3>
                        <p className="text-xs text-panel-muted mt-1">7 nodes · 7 relationships</p>
                      </div>
                      <Chip size="sm" color="primary" variant="flat">
                        Derivation
                      </Chip>
                    </div>

                    {/* SVG Graphic representation of Skill Graph */}
                    <div className="flex justify-center items-center py-6 bg-[#060a13] border border-panel-line/50 rounded-xl my-4">
                      <svg width="220" height="110" viewBox="0 0 220 110" role="img">
                        <title>Skill graph preview</title>
                        <line x1="40" y1="25" x2="110" y2="55" stroke="#242424" strokeWidth="1.5" />
                        <line x1="40" y1="85" x2="110" y2="55" stroke="#242424" strokeWidth="1.5" />
                        <line
                          x1="110"
                          y1="55"
                          x2="180"
                          y2="25"
                          stroke="#242424"
                          strokeWidth="1.5"
                        />
                        <line
                          x1="110"
                          y1="55"
                          x2="180"
                          y2="85"
                          stroke="#242424"
                          strokeWidth="1.5"
                        />

                        <circle
                          cx="40"
                          cy="25"
                          r="14"
                          fill="#0a0f1d"
                          stroke="#006fee"
                          strokeWidth="1.5"
                        />
                        <circle
                          cx="40"
                          cy="85"
                          r="14"
                          fill="#0a0f1d"
                          stroke="#a855f7"
                          strokeWidth="1.5"
                        />
                        <circle
                          cx="110"
                          cy="55"
                          r="14"
                          fill="#0a0f1d"
                          stroke="#22c55e"
                          strokeWidth="1.5"
                        />
                        <circle
                          cx="180"
                          cy="25"
                          r="14"
                          fill="#0a0f1d"
                          stroke="#737373"
                          strokeWidth="1.5"
                        />
                        <circle
                          cx="180"
                          cy="85"
                          r="14"
                          fill="#0a0f1d"
                          stroke="#7dd3fc"
                          strokeWidth="1.5"
                        />

                        <text
                          x="40"
                          y="28"
                          fill="#fff"
                          fontSize="8"
                          textAnchor="middle"
                          fontFamily="monospace"
                        >
                          Art
                        </text>
                        <text
                          x="40"
                          y="88"
                          fill="#fff"
                          fontSize="8"
                          textAnchor="middle"
                          fontFamily="monospace"
                        >
                          Prof
                        </text>
                        <text
                          x="110"
                          y="58"
                          fill="#fff"
                          fontSize="8"
                          textAnchor="middle"
                          fontFamily="monospace"
                        >
                          Cap
                        </text>
                        <text
                          x="180"
                          y="28"
                          fill="#fff"
                          fontSize="8"
                          textAnchor="middle"
                          fontFamily="monospace"
                        >
                          Ref
                        </text>
                        <text
                          x="180"
                          y="88"
                          fill="#fff"
                          fontSize="8"
                          textAnchor="middle"
                          fontFamily="monospace"
                        >
                          Scr
                        </text>
                      </svg>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      className="flex-1"
                      color="primary"
                      onPress={() => navigate('/skill-graph')}
                    >
                      Audit Derivation
                    </Button>
                  </div>
                </Card>
              </div>
            </div>

            {/* Bottom Operations Area */}
            <div className="grid gap-6 md:grid-cols-2">
              {/* Summary Stats Grid */}
              <Card className="border border-panel-line bg-panel-surface p-5 shadow-panel space-y-4">
                <h3 className="text-sm font-bold uppercase tracking-wider text-panel-muted border-b border-panel-line/30 pb-2">
                  Knowledge Scale Index
                </h3>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="bg-[#0a0f1d] border border-panel-line/50 p-4 rounded-xl text-center">
                    <p className="text-xs text-panel-muted">Total Traps</p>
                    <p className="text-2xl font-bold text-panel-text mt-1.5">1,248</p>
                  </div>
                  <div className="bg-[#0a0f1d] border border-panel-line/50 p-4 rounded-xl text-center">
                    <p className="text-xs text-panel-muted">Skill Artifacts</p>
                    <p className="text-2xl font-bold text-panel-text mt-1.5">342</p>
                  </div>
                  <div className="bg-[#0a0f1d] border border-panel-line/50 p-4 rounded-xl text-center">
                    <p className="text-xs text-panel-muted">Capsules</p>
                    <p className="text-2xl font-bold text-panel-text mt-1.5">4,892</p>
                  </div>
                </div>
              </Card>

              {/* Incidents / Alerts Panel */}
              <Card className="border border-panel-line bg-panel-surface p-5 shadow-panel space-y-4">
                <h3 className="text-sm font-bold uppercase tracking-wider text-panel-muted border-b border-panel-line/30 pb-2">
                  {t('activeIncidents')}
                </h3>
                <div className="space-y-3">
                  {model.incidents.map((incident) => (
                    <div
                      className="rounded-xl border border-rose-500/20 bg-rose-500/8 p-3 text-xs leading-relaxed text-rose-100 flex items-center gap-2.5"
                      key={incident}
                    >
                      <span className="h-2 w-2 rounded-full bg-rose-400 shrink-0" />
                      <span>{incident}</span>
                    </div>
                  ))}
                  {model.incidents.length === 0 && (
                    <div className="flex items-center gap-2 text-xs text-emerald-400 font-medium py-3">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      {t('allClear')}
                    </div>
                  )}
                </div>
              </Card>
            </div>
          </div>
        )}
      </PageContainer>
    </PageTransition>
  );
}
