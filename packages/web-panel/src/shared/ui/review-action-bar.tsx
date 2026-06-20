import { Button } from '@heroui/react';
import { useI18nStore } from '@trapmap/web-panel/stores/i18n-store';
import type { ReactElement } from 'react';

type ReviewActionBarProps = {
  error?: string | null;
  isPending?: boolean;
  onChangeRationale: (rationale: string) => void;
  onSubmitDecision: (
    decision: 'approve' | 'reject' | 'return-for-correction',
  ) => void | Promise<void>;
  rationale: string;
};

export function ReviewActionBar({
  error = null,
  isPending = false,
  onChangeRationale,
  onSubmitDecision,
  rationale,
}: ReviewActionBarProps): ReactElement {
  const { t } = useI18nStore();
  const isRationaleMissing = !rationale.trim();

  return (
    <div className="rounded-2xl border border-panel-line bg-panel-surface p-5 shadow-panel">
      <div className="relative flex flex-col gap-4">
        <div>
          <h3 className="text-lg font-semibold text-panel-text">{t('govActionPanel')}</h3>
          <p className="mt-2 text-sm leading-6 text-panel-muted">{t('govActionPanelDesc')}</p>
        </div>

        <div className="space-y-1">
          <label
            className="text-xs font-medium uppercase tracking-[0.12em] text-panel-muted"
            htmlFor="decision-rationale"
          >
            {t('decisionRationaleLabel')}
          </label>
          <textarea
            className="w-full min-h-[120px] rounded-md border border-panel-line bg-panel-surface-strong px-4 py-3 text-sm text-panel-text focus:outline-none focus:ring-1 focus:ring-panel-accent"
            id="decision-rationale"
            onChange={(e) => onChangeRationale(e.target.value)}
            placeholder={t('decisionRationalePlaceholder')}
            value={rationale}
          />
        </div>

        {error ? <p className="text-xs text-rose-300 font-medium">⚠️ {error}</p> : null}

        <div className="grid gap-3 pt-2 sm:grid-cols-3">
          <Button
            className="border border-panel-text bg-panel-text py-3 text-white font-medium"
            isDisabled={isPending}
            isPending={isPending}
            onPress={() => void onSubmitDecision('approve')}
            variant="primary"
          >
            {t('approveBtn')}
          </Button>
          <Button
            className="border border-[#ffd9d9] bg-[#fff5f5] py-3 text-[#c50000]"
            isDisabled={isRationaleMissing || isPending}
            isPending={isPending}
            onPress={() => void onSubmitDecision('reject')}
            variant="danger"
          >
            {t('rejectBtn')}
          </Button>
          <Button
            className="border border-[#ffd79e] bg-[#ffefcf] py-3 text-[#ab570a]"
            isDisabled={isRationaleMissing || isPending}
            isPending={isPending}
            onPress={() => void onSubmitDecision('return-for-correction')}
            variant="secondary"
          >
            {t('returnBtn')}
          </Button>
        </div>

        {isRationaleMissing && (
          <p className="text-xs text-amber-300">{t('rationaleRequiredWarning')}</p>
        )}
      </div>
    </div>
  );
}
