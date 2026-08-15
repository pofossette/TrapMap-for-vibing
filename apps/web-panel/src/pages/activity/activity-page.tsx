import { useActivityPageModel } from '@trapmap/web-panel/features/activity/use-activity-page-model';
import {
  localizeActivityType,
  normalizeActivityType,
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
  TimelineItem,
} from '@trapmap/web-panel/shared/ui';
import { useI18nStore } from '@trapmap/web-panel/stores/i18n-store';
import { type ReactElement, useMemo, useState } from 'react';

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
        typeFilter === 'all' || normalizeActivityType(event.typeLabel) === typeFilter;

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
              {t('eventVolume')}
            </p>
            <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-panel-text">
              {filteredEvents.length}
            </p>
            <p className="mt-2 text-sm leading-6 text-panel-muted">{t('eventVolumeDesc')}</p>
          </div>
          <div className="rounded-2xl border border-panel-line bg-panel-surface p-5 shadow-panel">
            <p className="font-mono text-[12px] font-medium uppercase text-panel-muted">
              {t('searchFocus')}
            </p>
            <p className="mt-3 text-lg font-semibold text-panel-text">
              {search.trim() || t('allOperatorsAndEvents')}
            </p>
            <p className="mt-2 text-sm leading-6 text-panel-muted">{t('searchFocusDesc')}</p>
          </div>
          <div className="rounded-2xl border border-panel-line bg-panel-surface p-5 shadow-panel">
            <p className="font-mono text-[12px] font-medium uppercase text-panel-muted">
              {t('typeSlice')}
            </p>
            <p className="mt-3 text-lg font-semibold text-panel-text">
              {typeFilter === 'all'
                ? t('allTypes')
                : typeFilter === 'decision'
                  ? t('decisions')
                  : typeFilter === 'intervention'
                    ? t('interventions')
                    : typeFilter === 'system-ingestion'
                      ? t('systemIngestion')
                      : t('unknownType')}
            </p>
            <p className="mt-2 text-sm leading-6 text-panel-muted">{t('typeSliceDesc')}</p>
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
            <FilterSelect
              value={typeFilter}
              onChange={setTypeFilter}
              options={[
                { id: 'all', label: t('allTypes') },
                { id: 'decision', label: t('decisions') },
                { id: 'intervention', label: t('interventions') },
                { id: 'system-ingestion', label: t('systemIngestion') },
              ]}
            />
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
                  <h3 className="text-lg font-semibold text-panel-text">
                    {t('operationalTimeline')}
                  </h3>
                  <p className="mt-1 text-sm text-panel-muted">{t('operationalTimelineDesc')}</p>
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
                    typeLabel={localizeActivityType(t, event.typeLabel)}
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
