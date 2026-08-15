import type { LifecycleState } from '@trapmap/contracts';
import type { useI18nStore } from '@trapmap/web-panel/stores/i18n-store';

import type {
  ActivityEventViewModel,
  ReviewItemViewModel,
  ReviewWarning,
} from '@trapmap/web-panel/shared/enum-types';

type Translate = ReturnType<typeof useI18nStore.getState>['t'];

export function localizeReviewRiskLabel(
  t: Translate,
  riskLabel: ReviewItemViewModel['riskLabel'],
): string {
  if (riskLabel === 'high') return t('highRisk');
  if (riskLabel === 'medium') return t('mediumRisk');
  return t('lowRisk');
}

export function localizeServiceHealth(
  t: Translate,
  status: 'healthy' | 'degraded' | 'failed',
): string {
  if (status === 'healthy') return t('serviceHealthy');
  if (status === 'degraded') return t('serviceDegraded');
  return t('serviceFailed');
}

export function localizeLifecycleState(t: Translate, status: LifecycleState | string): string {
  if (status === 'draft') return t('draft');
  if (status === 'submitted') return t('submitted');
  if (status === 'agent-pass') return t('agentPass');
  if (status === 'agent-rejected') return t('agentRejected');
  if (status === 'approved') return t('approved');
  if (status === 'rejected') return t('rejected');
  if (status === 'deactivated') return t('deactivated');
  return t('unknownStatus');
}

export function localizeReviewSource(t: Translate, source: string): string {
  if (source === 'knowledge-entry') {
    return t('knowledgeEntry');
  }

  return source;
}

export function localizeReviewWarningKind(
  t: Translate,
  warningKind: ReviewWarning['kind'] | string,
): string {
  if (warningKind === 'agent-note') return t('agentNote');
  if (warningKind === 'manual-flag') return t('manualFlag');
  if (warningKind === 'system') return t('systemWarning');
  return t('unknownType');
}

export function normalizeActivityType(
  rawType: string,
): 'decision' | 'intervention' | 'system-ingestion' | 'unknown' {
  const normalized = rawType.trim().toLowerCase();

  if (normalized === 'decision' || normalized === 'review decision') {
    return 'decision';
  }

  if (normalized === 'intervention' || normalized === 'manual intervention') {
    return 'intervention';
  }

  if (normalized === 'system ingestion' || normalized === 'system-ingestion') {
    return 'system-ingestion';
  }

  return 'unknown';
}

export function localizeActivityType(
  t: Translate,
  rawType: ActivityEventViewModel['typeLabel'],
): string {
  const type = normalizeActivityType(rawType);

  if (type === 'decision') return t('decisions');
  if (type === 'intervention') return t('interventions');
  if (type === 'system-ingestion') return t('systemIngestion');
  return t('unknownType');
}
