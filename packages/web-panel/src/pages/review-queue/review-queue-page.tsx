import { ListBox, Select } from '@heroui/react';
import type { ReactElement } from 'react';
import { Link } from 'react-router-dom';

import { useReviewQueuePageModel } from '../../features/review-queue/use-review-queue-page-model';
import { FadeIn, PageTransition } from '../../shared/motion';
import {
  EmptyState,
  ErrorPanel,
  FilterItem,
  FilterToolbar,
  PageContainer,
  SectionHeader,
  SkeletonBlock,
  StatusBadge,
} from '../../shared/ui';
import { useI18nStore } from '../../stores/i18n-store';

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
              Queue Pulse
            </p>
            <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-panel-text">
              {model.items.length}
            </p>
            <p className="mt-2 text-sm leading-6 text-panel-muted">
              Items currently visible after filter application.
            </p>
          </div>
          <div className="rounded-2xl border border-panel-line bg-panel-surface p-5 shadow-panel">
            <p className="font-mono text-[12px] font-medium uppercase text-panel-muted">
              Highest Risk
            </p>
            <p className="mt-3 text-lg font-semibold text-panel-text">
              {model.items[0]?.riskLabel ?? 'No items'}
            </p>
            <p className="mt-2 text-sm leading-6 text-panel-muted">
              Prioritize entries with schema, correctness, or duplicate pressure.
            </p>
          </div>
          <div className="rounded-2xl border border-panel-line bg-panel-surface p-5 shadow-panel">
            <p className="font-mono text-[12px] font-medium uppercase text-panel-muted">Focus</p>
            <p className="mt-3 text-lg font-semibold text-panel-text">
              {model.filters.status === 'all' ? 'All statuses' : model.filters.status}
            </p>
            <p className="mt-2 text-sm leading-6 text-panel-muted">
              Current queue slice based on status, source, risk, and search.
            </p>
          </div>
        </section>

        {/* Filter Toolbar using shared component */}
        <FilterToolbar>
          <FilterItem label={t('statusLabel')}>
            <Select
              className="w-full"
              value={model.filters.status}
              onChange={(val) =>
                model.updateFilters({
                  status: (val ? String(val) : 'all') as typeof model.filters.status,
                })
              }
            >
              <Select.Trigger className="relative w-full flex items-center justify-between rounded-md border border-panel-line bg-panel-surface px-3 py-2.5 text-sm text-panel-text focus:outline-none focus:ring-1 focus:ring-panel-accent cursor-pointer transition duration-200 outline-none">
                <Select.Value />
                <Select.Indicator className="text-panel-muted transition-transform duration-200" />
              </Select.Trigger>
              <Select.Popover className="min-w-[220px] rounded-xl border border-panel-line bg-panel-surface p-1.5 shadow-panel">
                <ListBox className="outline-none">
                  {[
                    { id: 'all', label: t('allStatus') },
                    { id: 'submitted', label: 'Submitted' },
                    { id: 'approved', label: 'Approved' },
                    { id: 'rejected', label: 'Rejected' },
                  ].map((opt) => (
                    <ListBox.Item
                      key={opt.id}
                      id={opt.id}
                      textValue={opt.label}
                      className="flex items-center justify-between px-3 py-2 text-sm rounded-lg text-panel-text hover:bg-panel-elevated/60 cursor-pointer outline-none data-[focused=true]:bg-panel-elevated/60 data-[selected=true]:text-panel-accent data-[selected=true]:font-medium transition duration-150"
                    >
                      {opt.label}
                      <ListBox.ItemIndicator>
                        <svg
                          role="img"
                          aria-label="Selected"
                          className="h-4 w-4 text-panel-accent shrink-0"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2.5}
                          viewBox="0 0 24 24"
                        >
                          <title>Selected</title>
                          <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </ListBox.ItemIndicator>
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>
          </FilterItem>

          <FilterItem label={t('riskLevel')}>
            <Select
              className="w-full"
              value={model.filters.riskLevel}
              onChange={(val) =>
                model.updateFilters({
                  riskLevel: (val ? String(val) : 'all') as typeof model.filters.riskLevel,
                })
              }
            >
              <Select.Trigger className="relative w-full flex items-center justify-between rounded-md border border-panel-line bg-panel-surface px-3 py-2.5 text-sm text-panel-text focus:outline-none focus:ring-1 focus:ring-panel-accent cursor-pointer transition duration-200 outline-none">
                <Select.Value />
                <Select.Indicator className="text-panel-muted transition-transform duration-200" />
              </Select.Trigger>
              <Select.Popover className="min-w-[220px] rounded-xl border border-panel-line bg-panel-surface p-1.5 shadow-panel">
                <ListBox className="outline-none">
                  {[
                    { id: 'all', label: t('allRisk') },
                    { id: 'high', label: t('highRisk') },
                    { id: 'medium', label: t('mediumRisk') },
                    { id: 'low', label: t('lowRisk') },
                  ].map((opt) => (
                    <ListBox.Item
                      key={opt.id}
                      id={opt.id}
                      textValue={opt.label}
                      className="flex items-center justify-between px-3 py-2 text-sm rounded-lg text-panel-text hover:bg-panel-elevated/60 cursor-pointer outline-none data-[focused=true]:bg-panel-elevated/60 data-[selected=true]:text-panel-accent data-[selected=true]:font-medium transition duration-150"
                    >
                      {opt.label}
                      <ListBox.ItemIndicator>
                        <svg
                          role="img"
                          aria-label="Selected"
                          className="h-4 w-4 text-panel-accent shrink-0"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2.5}
                          viewBox="0 0 24 24"
                        >
                          <title>Selected</title>
                          <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </ListBox.ItemIndicator>
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>
          </FilterItem>

          <FilterItem label={t('sourceLabel')}>
            <input
              className="w-full rounded-md border border-panel-line bg-panel-surface px-3 py-2.5 text-sm text-panel-text focus:outline-none focus:ring-1 focus:ring-panel-accent"
              onChange={(event) => model.updateFilters({ source: event.target.value || 'all' })}
              placeholder={t('allSources')}
              type="text"
              value={model.filters.source === 'all' ? '' : model.filters.source}
            />
          </FilterItem>

          <FilterItem label="Sort By">
            <Select
              className="w-full"
              value={model.filters.sort}
              onChange={(val) =>
                model.updateFilters({
                  sort: (val ? String(val) : 'highest-risk') as typeof model.filters.sort,
                })
              }
            >
              <Select.Trigger className="relative w-full flex items-center justify-between rounded-md border border-panel-line bg-panel-surface px-3 py-2.5 text-sm text-panel-text focus:outline-none focus:ring-1 focus:ring-panel-accent cursor-pointer transition duration-200 outline-none">
                <Select.Value />
                <Select.Indicator className="text-panel-muted transition-transform duration-200" />
              </Select.Trigger>
              <Select.Popover className="min-w-[220px] rounded-xl border border-panel-line bg-panel-surface p-1.5 shadow-panel">
                <ListBox className="outline-none">
                  {[
                    { id: 'highest-risk', label: t('sortHighestRisk') },
                    { id: 'newest', label: t('sortNewest') },
                    { id: 'oldest', label: t('sortOldest') },
                    { id: 'longest-waiting', label: t('sortLongestWaiting') },
                  ].map((opt) => (
                    <ListBox.Item
                      key={opt.id}
                      id={opt.id}
                      textValue={opt.label}
                      className="flex items-center justify-between px-3 py-2 text-sm rounded-lg text-panel-text hover:bg-panel-elevated/60 cursor-pointer outline-none data-[focused=true]:bg-panel-elevated/60 data-[selected=true]:text-panel-accent data-[selected=true]:font-medium transition duration-150"
                    >
                      {opt.label}
                      <ListBox.ItemIndicator>
                        <svg
                          role="img"
                          aria-label="Selected"
                          className="h-4 w-4 text-panel-accent shrink-0"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2.5}
                          viewBox="0 0 24 24"
                        >
                          <title>Selected</title>
                          <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </ListBox.ItemIndicator>
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>
          </FilterItem>

          <FilterItem label="Search Query">
            <input
              className="w-full rounded-md border border-panel-line bg-panel-surface px-3 py-2.5 text-sm text-panel-text focus:outline-none focus:ring-1 focus:ring-panel-accent"
              onChange={(event) => model.updateFilters({ search: event.target.value })}
              placeholder={t('searchPlaceholder')}
              type="text"
              value={model.filters.search}
            />
          </FilterItem>
        </FilterToolbar>

        {/* List states rendering */}
        {model.loading && model.items.length === 0 ? (
          <SkeletonBlock count={5} variant="table" />
        ) : model.items.length === 0 ? (
          <EmptyState
            description="No pending items match your filter preferences. Change selection or check later."
            title={t('noReviewsFound')}
          />
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
                          {item.riskLabel}
                        </StatusBadge>
                      </div>
                      <p className="text-sm leading-6 text-panel-muted/95">{item.subtitle}</p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                      <div className="rounded-xl border border-panel-line bg-panel-surface-strong px-4 py-3">
                        <p className="font-mono text-[12px] font-medium uppercase text-panel-muted">
                          {t('sourceLabel')}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-panel-text">{item.source}</p>
                      </div>
                      <div className="rounded-xl border border-panel-line bg-panel-surface-strong px-4 py-3">
                        <p className="font-mono text-[12px] font-medium uppercase text-panel-muted">
                          {t('statusLabel')}
                        </p>
                        <p className="mt-1 text-sm font-semibold capitalize text-panel-text">
                          {item.status}
                        </p>
                      </div>
                      <div className="rounded-xl border border-panel-line bg-panel-surface-strong px-4 py-3">
                        <p className="font-mono text-[12px] font-medium uppercase text-panel-muted">
                          Created
                        </p>
                        <p className="mt-1 text-sm font-semibold text-panel-text">
                          {item.createdAt}
                        </p>
                      </div>
                    </div>

                    <Link
                      className="inline-flex items-center justify-center rounded-full border border-panel-text bg-panel-text px-4 py-3 text-sm font-medium text-white transition shrink-0 select-none cursor-pointer"
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
      </PageContainer>
    </PageTransition>
  );
}
