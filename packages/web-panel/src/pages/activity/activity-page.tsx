import { ListBox, Select } from '@heroui/react';
import { type ReactElement, useMemo, useState } from 'react';
import { useActivityPageModel } from '../../features/activity/use-activity-page-model';
import { FadeIn, PageTransition } from '../../shared/motion';
import {
  EmptyState,
  ErrorPanel,
  FilterItem,
  FilterToolbar,
  PageContainer,
  SectionHeader,
  SkeletonBlock,
  TimelineItem,
} from '../../shared/ui';
import { useI18nStore } from '../../stores/i18n-store';

export function ActivityPage(): ReactElement {
  const model = useActivityPageModel();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const { t } = useI18nStore();

  // Local client-side filtering of activity logs
  const filteredEvents = useMemo(() => {
    return model.events.filter((event) => {
      const matchesSearch =
        event.title.toLowerCase().includes(search.toLowerCase()) ||
        event.actor.toLowerCase().includes(search.toLowerCase()) ||
        event.description.toLowerCase().includes(search.toLowerCase());

      const matchesType =
        typeFilter === 'all' || event.typeLabel.toLowerCase() === typeFilter.toLowerCase();

      return matchesSearch && matchesType;
    });
  }, [model.events, search, typeFilter]);

  if (model.error) {
    return (
      <PageTransition className="space-y-6">
        <SectionHeader title={t('activityTitle')} />
        <ErrorPanel message={model.error} />
      </PageTransition>
    );
  }

  return (
    <PageTransition className="space-y-6">
      <PageContainer>
        <SectionHeader description={t('activityDesc')} title={t('activityTitle')} />

        <section className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-panel-line bg-panel-surface p-5 shadow-panel">
            <p className="font-mono text-[12px] font-medium uppercase text-panel-muted">
              Event Volume
            </p>
            <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-panel-text">
              {filteredEvents.length}
            </p>
            <p className="mt-2 text-sm leading-6 text-panel-muted">
              Visible timeline events after applying current filters.
            </p>
          </div>
          <div className="rounded-2xl border border-panel-line bg-panel-surface p-5 shadow-panel">
            <p className="font-mono text-[12px] font-medium uppercase text-panel-muted">
              Search Focus
            </p>
            <p className="mt-3 text-lg font-semibold text-panel-text">
              {search.trim() || 'All operators and events'}
            </p>
            <p className="mt-2 text-sm leading-6 text-panel-muted">
              Narrow by actor, title, or event description.
            </p>
          </div>
          <div className="rounded-2xl border border-panel-line bg-panel-surface p-5 shadow-panel">
            <p className="font-mono text-[12px] font-medium uppercase text-panel-muted">
              Type Slice
            </p>
            <p className="mt-3 text-lg font-semibold text-panel-text">
              {typeFilter === 'all' ? t('allTypes') : typeFilter}
            </p>
            <p className="mt-2 text-sm leading-6 text-panel-muted">
              Review operational activity by event class.
            </p>
          </div>
        </section>

        {/* Filters Toolbar */}
        <FilterToolbar>
          <FilterItem label={t('searchLogs')}>
            <input
              className="w-full rounded-md border border-panel-line bg-panel-surface px-3 py-2.5 text-sm text-panel-text focus:outline-none focus:ring-1 focus:ring-panel-accent"
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('searchLogsPlaceholder')}
              type="text"
              value={search}
            />
          </FilterItem>
          <FilterItem label={t('typeFilter')}>
            <Select
              className="w-full"
              value={typeFilter}
              onChange={(val) => setTypeFilter(val ? String(val) : 'all')}
            >
              <Select.Trigger className="relative w-full flex items-center justify-between rounded-md border border-panel-line bg-panel-surface px-3 py-2.5 text-sm text-panel-text focus:outline-none focus:ring-1 focus:ring-panel-accent cursor-pointer transition duration-200 outline-none">
                <Select.Value />
                <Select.Indicator className="text-panel-muted transition-transform duration-200" />
              </Select.Trigger>
              <Select.Popover className="min-w-[220px] rounded-xl border border-panel-line bg-panel-surface p-1.5 shadow-panel">
                <ListBox className="outline-none">
                  <ListBox.Item
                    id="all"
                    textValue={t('allTypes')}
                    className="flex items-center justify-between px-3 py-2 text-sm rounded-lg text-panel-text hover:bg-panel-elevated/60 cursor-pointer outline-none data-[focused=true]:bg-panel-elevated/60 data-[selected=true]:text-panel-accent data-[selected=true]:font-medium transition duration-150"
                  >
                    {t('allTypes')}
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
                  <ListBox.Item
                    id="Review Decision"
                    textValue={t('decisions')}
                    className="flex items-center justify-between px-3 py-2 text-sm rounded-lg text-panel-text hover:bg-panel-elevated/60 cursor-pointer outline-none data-[focused=true]:bg-panel-elevated/60 data-[selected=true]:text-panel-accent data-[selected=true]:font-medium transition duration-150"
                  >
                    {t('decisions')}
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
                  <ListBox.Item
                    id="Manual Intervention"
                    textValue={t('interventions')}
                    className="flex items-center justify-between px-3 py-2 text-sm rounded-lg text-panel-text hover:bg-panel-elevated/60 cursor-pointer outline-none data-[focused=true]:bg-panel-elevated/60 data-[selected=true]:text-panel-accent data-[selected=true]:font-medium transition duration-150"
                  >
                    {t('interventions')}
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
                  <ListBox.Item
                    id="System Ingestion"
                    textValue={t('systemIngestion')}
                    className="flex items-center justify-between px-3 py-2 text-sm rounded-lg text-panel-text hover:bg-panel-elevated/60 cursor-pointer outline-none data-[focused=true]:bg-panel-elevated/60 data-[selected=true]:text-panel-accent data-[selected=true]:font-medium transition duration-150"
                  >
                    {t('systemIngestion')}
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
                </ListBox>
              </Select.Popover>
            </Select>
          </FilterItem>
        </FilterToolbar>

        {/* List states */}
        {model.loading ? (
          <SkeletonBlock count={5} variant="table" />
        ) : filteredEvents.length === 0 ? (
          <EmptyState
            description={
              model.events.length === 0 ? t('noActivityLogsDesc') : t('noMatchedLogsDesc')
            }
            title={t('noActivityLogs')}
          />
        ) : (
          <FadeIn>
            <div className="rounded-2xl border border-panel-line bg-panel-surface p-5 shadow-panel">
              <div className="mb-5 flex items-center justify-between gap-3 border-b border-panel-line pb-4">
                <div>
                  <h3 className="text-lg font-semibold text-panel-text">Operational Timeline</h3>
                  <p className="mt-1 text-sm text-panel-muted">
                    Ordered stream of review decisions, manual interventions, and runtime actions.
                  </p>
                </div>
              </div>
              <div className="relative ml-2 border-l-0 border-panel-line/30">
                {filteredEvents.map((event) => (
                  <TimelineItem
                    actor={event.actor}
                    description={event.description}
                    key={event.id}
                    linkTo={event.relatedReviewId ? `/reviews/${event.relatedReviewId}` : undefined}
                    timestamp={event.timestamp}
                    title={event.title}
                    tone={event.tone}
                    typeLabel={event.typeLabel}
                  />
                ))}
              </div>
            </div>
          </FadeIn>
        )}
      </PageContainer>
    </PageTransition>
  );
}
