import { Button } from '@heroui/react';
import { useActivityPageModel } from '@trapmap/web-panel/features/activity/use-activity-page-model';
import { localizeActivityType } from '@trapmap/web-panel/shared/lib/display-labels';
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
import type { ReactElement } from 'react';

const activityInputClassName =
  'h-panel-control w-full rounded-panel-md border border-panel-line bg-panel-surface px-3 text-sm text-panel-text focus:outline-none focus:ring-1 focus:ring-panel-accent';

export function ActivityPage(): ReactElement {
  const model = useActivityPageModel();
  const { t } = useI18nStore();

  if (model.error) {
    return (
      <PageTransition className="space-y-6">
        <SectionHeader title={t('activityTitle')} />
        <ErrorPanel message={model.error} onRetry={() => void model.refresh()} />
      </PageTransition>
    );
  }

  return (
    <PageTransition className="space-y-6">
      <PageContainer>
        <SectionHeader description={t('activityDesc')} title={t('activityTitle')} />

        <section className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-panel-lg border border-panel-line bg-panel-surface p-5 shadow-panel">
            <p className="font-mono text-[12px] font-medium uppercase text-panel-muted">
              {t('eventVolume')}
            </p>
            <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-panel-text">
              {model.page.filteredTotal}
            </p>
            <p className="mt-2 text-sm leading-6 text-panel-muted">{t('eventVolumeDesc')}</p>
          </div>
          <div className="rounded-panel-lg border border-panel-line bg-panel-surface p-5 shadow-panel">
            <p className="font-mono text-[12px] font-medium uppercase text-panel-muted">
              {t('searchFocus')}
            </p>
            <p className="mt-3 truncate text-lg font-semibold text-panel-text">
              {model.filters.search.trim() ||
                model.filters.actor.trim() ||
                t('allOperatorsAndEvents')}
            </p>
            <p className="mt-2 text-sm leading-6 text-panel-muted">{t('searchFocusDesc')}</p>
          </div>
          <div className="rounded-panel-lg border border-panel-line bg-panel-surface p-5 shadow-panel">
            <p className="font-mono text-[12px] font-medium uppercase text-panel-muted">
              {t('typeSlice')}
            </p>
            <p className="mt-3 text-lg font-semibold text-panel-text">
              {model.filters.type === 'all'
                ? t('allTypes')
                : model.filters.type === 'decision'
                  ? t('decisions')
                  : model.filters.type === 'intervention'
                    ? t('interventions')
                    : t('systemIngestion')}
            </p>
            <p className="mt-2 text-sm leading-6 text-panel-muted">{t('typeSliceDesc')}</p>
          </div>
        </section>

        <FilterToolbar>
          <FilterItem label={t('actorFilter')}>
            <input
              className={activityInputClassName}
              onChange={(event) => model.updateFilters({ actor: event.target.value })}
              placeholder={t('allOperators')}
              type="text"
              value={model.filters.actor}
            />
          </FilterItem>

          <FilterItem label={t('typeFilter')}>
            <FilterSelect
              onChange={(value) =>
                model.updateFilters({
                  type: value as typeof model.filters.type,
                })
              }
              options={[
                { id: 'all', label: t('allTypes') },
                { id: 'decision', label: t('decisions') },
                { id: 'intervention', label: t('interventions') },
                { id: 'system-ingestion', label: t('systemIngestion') },
              ]}
              value={model.filters.type}
            />
          </FilterItem>

          <FilterItem label={t('fromLabel')}>
            <input
              className={activityInputClassName}
              max={model.filters.to || undefined}
              min={model.filters.from || undefined}
              onChange={(event) => model.updateFilters({ from: event.target.value })}
              type="date"
              value={model.filters.from}
            />
          </FilterItem>

          <FilterItem label={t('toLabel')}>
            <input
              className={activityInputClassName}
              max={model.filters.to || undefined}
              min={model.filters.from || undefined}
              onChange={(event) => model.updateFilters({ to: event.target.value })}
              type="date"
              value={model.filters.to}
            />
          </FilterItem>

          <FilterItem label={t('searchLogs')}>
            <input
              className={activityInputClassName}
              onChange={(event) => model.updateFilters({ search: event.target.value })}
              placeholder={t('searchLogsPlaceholder')}
              type="search"
              value={model.filters.search}
            />
          </FilterItem>
        </FilterToolbar>

        {model.loading ? (
          <SkeletonBlock count={5} variant="table" />
        ) : model.page.filteredTotal === 0 ? (
          <EmptyState
            description={model.page.total === 0 ? t('noActivityLogsDesc') : t('noMatchedLogsDesc')}
            title={t('noActivityLogs')}
          />
        ) : (
          <FadeIn>
            <div className="rounded-panel-lg border border-panel-line bg-panel-surface p-5 shadow-panel">
              <div className="mb-5 flex items-center justify-between gap-3 border-b border-panel-line pb-4">
                <div>
                  <h3 className="text-lg font-semibold text-panel-text">
                    {t('operationalTimeline')}
                  </h3>
                  <p className="mt-1 text-sm text-panel-muted">{t('operationalTimelineDesc')}</p>
                </div>
              </div>
              <div className="relative ml-2 border-l-0 border-panel-line/30">
                {model.page.events.map((event) => (
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

        {model.page.events.length > 0 && (
          <nav className="flex items-center justify-between gap-3">
            <Button
              isDisabled={model.cursor === null}
              variant="secondary"
              onPress={() => {
                const offset = Number.parseInt(model.cursor ?? '0', 10);
                model.updateCursor(offset > 20 ? String(offset - 20) : null);
              }}
            >
              {t('previousPage')}
            </Button>
            <Button
              isDisabled={model.page.nextCursor === null}
              variant="secondary"
              onPress={() => model.updateCursor(model.page.nextCursor)}
            >
              {t('nextPage')}
            </Button>
          </nav>
        )}
      </PageContainer>
    </PageTransition>
  );
}
