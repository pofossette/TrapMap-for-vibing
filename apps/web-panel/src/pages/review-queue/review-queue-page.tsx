import { Button } from '@heroui/react';
import type { ReactElement } from 'react';
import { Link } from 'react-router-dom';

import { useReviewQueuePageModel } from '@trapmap/web-panel/features/review-queue/use-review-queue-page-model';
import {
  localizeLifecycleState,
  localizeReviewRiskLabel,
  localizeReviewSource,
} from '@trapmap/web-panel/shared/lib/display-labels';
import { FadeIn, PageTransition } from '@trapmap/web-panel/shared/motion';
import {
  EmptyState,
  ErrorPanel,
  FilterItem,
  FilterSelect,
  FilterToolbar,
  PageContainer,
  SectionHeader,
  SkeletonBlock,
  StatusBadge,
} from '@trapmap/web-panel/shared/ui';
import { useI18nStore } from '@trapmap/web-panel/stores/i18n-store';

export function ReviewQueuePage(): ReactElement {
  const model = useReviewQueuePageModel();
  const { t } = useI18nStore();

  if (model.error) {
    return (
      <PageTransition className="space-y-6">
        <SectionHeader title={t('reviewQueueTitle')} />
        <ErrorPanel message={model.error} />
      </PageTransition>
    );
  }

  return (
    <PageTransition className="space-y-6">
      <PageContainer>
        <SectionHeader description={t('reviewQueueDesc')} title={t('reviewQueueTitle')} />

        <section className="grid gap-4 lg:grid-cols-[1.2fr,0.8fr,0.8fr]">
          <div className="rounded-2xl border border-panel-line bg-panel-surface p-5 shadow-panel">
            <p className="font-mono text-[12px] font-medium uppercase text-panel-muted">
              {t('queuePulse')}
            </p>
            <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-panel-text">
              {model.filteredTotal}
            </p>
            <p className="mt-2 text-sm leading-6 text-panel-muted">{t('queuePulseDesc')}</p>
          </div>
          <div className="rounded-2xl border border-panel-line bg-panel-surface p-5 shadow-panel">
            <p className="font-mono text-[12px] font-medium uppercase text-panel-muted">
              {t('highestRisk')}
            </p>
            <p className="mt-3 text-lg font-semibold text-panel-text">
              {model.items[0] ? localizeReviewRiskLabel(t, model.items[0].riskLabel) : t('noItems')}
            </p>
            <p className="mt-2 text-sm leading-6 text-panel-muted">{t('highestRiskDesc')}</p>
          </div>
          <div className="rounded-2xl border border-panel-line bg-panel-surface p-5 shadow-panel">
            <p className="font-mono text-[12px] font-medium uppercase text-panel-muted">
              {t('focus')}
            </p>
            <p className="mt-3 text-lg font-semibold text-panel-text">
              {model.filters.status === 'all'
                ? t('allStatuses')
                : model.filters.status === 'submitted'
                  ? t('submitted')
                  : model.filters.status === 'approved'
                    ? t('approved')
                    : model.filters.status === 'rejected'
                      ? t('rejected')
                      : model.filters.status}
            </p>
            <p className="mt-2 text-sm leading-6 text-panel-muted">{t('focusDesc')}</p>
          </div>
        </section>

        {/* Filter Toolbar using shared component */}
        <FilterToolbar>
          <FilterItem label={t('statusLabel')}>
            <FilterSelect
              value={model.filters.status}
              onChange={(val) =>
                model.updateFilters({ status: val as typeof model.filters.status })
              }
              options={[
                { id: 'all', label: t('allStatus') },
                { id: 'submitted', label: t('submitted') },
                { id: 'approved', label: t('approved') },
                { id: 'rejected', label: t('rejected') },
              ]}
            />
          </FilterItem>

          <FilterItem label={t('riskLevel')}>
            <FilterSelect
              value={model.filters.riskLevel}
              onChange={(val) =>
                model.updateFilters({ riskLevel: val as typeof model.filters.riskLevel })
              }
              options={[
                { id: 'all', label: t('allRisk') },
                { id: 'high', label: t('highRisk') },
                { id: 'medium', label: t('mediumRisk') },
                { id: 'low', label: t('lowRisk') },
              ]}
            />
          </FilterItem>

          <FilterItem label={t('sourceLabel')}>
            <input
              className="h-panel-control w-full rounded-panel-md border border-panel-line bg-panel-surface px-3 text-sm text-panel-text focus:outline-none focus:ring-1 focus:ring-panel-accent"
              onChange={(event) => model.updateFilters({ source: event.target.value || 'all' })}
              placeholder={t('allSources')}
              type="text"
              value={model.filters.source === 'all' ? '' : model.filters.source}
            />
          </FilterItem>

          <FilterItem label={t('sortBy')}>
            <FilterSelect
              value={model.filters.sort}
              onChange={(val) => model.updateFilters({ sort: val as typeof model.filters.sort })}
              options={[
                { id: 'highest-risk', label: t('sortHighestRisk') },
                { id: 'newest', label: t('sortNewest') },
                { id: 'oldest', label: t('sortOldest') },
                { id: 'longest-waiting', label: t('sortLongestWaiting') },
              ]}
            />
          </FilterItem>

          <FilterItem label={t('searchQuery')}>
            <input
              className="h-panel-control w-full rounded-panel-md border border-panel-line bg-panel-surface px-3 text-sm text-panel-text focus:outline-none focus:ring-1 focus:ring-panel-accent"
              onChange={(event) => model.updateFilters({ search: event.target.value })}
              placeholder={t('searchQueryPlaceholder')}
              type="text"
              value={model.filters.search}
            />
          </FilterItem>
        </FilterToolbar>

        {/* List states rendering */}
        {model.loading && model.items.length === 0 ? (
          <SkeletonBlock count={5} variant="table" />
        ) : model.items.length === 0 ? (
          <EmptyState description={t('noMatchingReviewsDesc')} title={t('noReviewsFound')} />
        ) : (
          <FadeIn>
            <div className="space-y-3">
              {model.items.map((item) => (
                <article
                  className="rounded-2xl border border-panel-line bg-panel-surface p-5 shadow-panel transition hover:border-panel-line-strong"
                  key={item.id}
                >
                  <div className="grid gap-4 lg:grid-cols-[1.4fr,0.7fr,0.45fr] lg:items-center">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="text-lg font-semibold tracking-[-0.4px] text-panel-text">
                          {item.title}
                        </h3>
                        <StatusBadge tone={item.riskTone === 'neutral' ? 'success' : item.riskTone}>
                          {localizeReviewRiskLabel(t, item.riskLabel)}
                        </StatusBadge>
                      </div>
                      <p className="text-sm leading-6 text-panel-muted/95">{item.subtitle}</p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                      <div className="rounded-xl border border-panel-line bg-panel-surface-strong px-4 py-3">
                        <p className="font-mono text-[12px] font-medium uppercase text-panel-muted">
                          {t('sourceLabel')}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-panel-text">
                          {localizeReviewSource(t, item.source)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-panel-line bg-panel-surface-strong px-4 py-3">
                        <p className="font-mono text-[12px] font-medium uppercase text-panel-muted">
                          {t('statusLabel')}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-panel-text">
                          {localizeLifecycleState(t, item.status)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-panel-line bg-panel-surface-strong px-4 py-3">
                        <p className="font-mono text-[12px] font-medium uppercase text-panel-muted">
                          {t('createdAt')}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-panel-text">
                          {item.createdAt}
                        </p>
                      </div>
                    </div>

                    <Link
                      className="panel-primary-action inline-flex shrink-0 select-none items-center justify-center rounded-panel-md border px-4 text-sm font-semibold transition cursor-pointer"
                      to={`/reviews/${item.id}`}
                    >
                      {t('viewDetails')}
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </FadeIn>
        )}

        {model.items.length > 0 && (
          <nav className="flex items-center justify-between gap-3">
            <Button
              isDisabled={model.paging.cursor === null}
              variant="secondary"
              onPress={() => {
                const offset = Number.parseInt(model.paging.cursor ?? '0', 10);
                const previous = offset - model.paging.limit;
                model.updatePaging({ cursor: previous > 0 ? String(previous) : null });
              }}
            >
              {t('previousPage')}
            </Button>
            <Button
              isDisabled={model.nextCursor === null}
              variant="secondary"
              onPress={() => model.updatePaging({ cursor: model.nextCursor })}
            >
              {t('nextPage')}
            </Button>
          </nav>
        )}
      </PageContainer>
    </PageTransition>
  );
}
