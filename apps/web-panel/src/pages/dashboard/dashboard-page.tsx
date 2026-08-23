import { toast } from '@heroui/react';
import type { ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';

import { useDashboardPageModel } from '@trapmap/web-panel/features/dashboard/use-dashboard-page-model';
import { PageTransition } from '@trapmap/web-panel/shared/motion';
import { ErrorPanel, PageContainer, SkeletonBlock } from '@trapmap/web-panel/shared/ui';
import { useI18nStore } from '@trapmap/web-panel/stores/i18n-store';

import {
  DashboardHeader,
  IncidentsCard,
  KnowledgeScaleCard,
  PendingActionsCard,
  ServiceHealthCard,
  SkillGraphCard,
  TrapGraphCard,
} from './dashboard-sections';

export function DashboardPage(): ReactElement {
  const model = useDashboardPageModel();
  const { t } = useI18nStore();
  const navigate = useNavigate();

  async function refresh() {
    if (await model.refresh()) {
      toast.success(t('metricsRefreshed'));
      return;
    }

    toast.danger(t('metricsRefreshFailed'));
  }

  if (model.error) {
    return (
      <PageTransition className="space-y-6">
        <PageContainer>
          <DashboardHeader
            loading={model.loading}
            onRefresh={() => void refresh()}
            overview={model.overview}
          />
        </PageContainer>
        <PageContainer>
          <ErrorPanel message={model.error} onRetry={() => void model.refresh()} />
        </PageContainer>
      </PageTransition>
    );
  }

  return (
    <PageTransition className="space-y-6">
      <PageContainer>
        <DashboardHeader
          loading={model.loading}
          onRefresh={() => void refresh()}
          overview={model.overview}
        />

        {model.loading && !model.overview ? (
          <div className="space-y-6">
            <SkeletonBlock count={4} variant="card" />
            <SkeletonBlock count={5} variant="line" />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-[4.5fr,7.5fr]">
              <div className="space-y-6">
                <ServiceHealthCard services={model.services} />
                <PendingActionsCard
                  onOpenActivity={() => navigate('/activity')}
                  onOpenReviews={() => navigate('/reviews')}
                  overview={model.overview}
                />
              </div>

              <div className="grid gap-6 sm:grid-cols-2">
                <TrapGraphCard
                  onOpen={() => navigate('/trap-graph')}
                  stats={model.trapGraphStats}
                />
                <SkillGraphCard
                  onOpen={() => navigate('/skill-graph')}
                  stats={model.skillGraphStats}
                />
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <KnowledgeScaleCard scale={model.scale} />
              <IncidentsCard incidents={model.incidents} />
            </div>
          </div>
        )}
      </PageContainer>
    </PageTransition>
  );
}
