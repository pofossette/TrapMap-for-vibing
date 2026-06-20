import { Button } from '@heroui/react';
import { useI18nStore } from '@trapmap/web-panel/stores/i18n-store';
import type { ReactElement, ReactNode } from 'react';

type EmptyStateProps = {
  action?: {
    label: string;
    onPress: () => void | Promise<void>;
  };
  description?: string;
  icon?: ReactNode;
  title?: string;
};

export function EmptyState({ action, description, icon, title }: EmptyStateProps): ReactElement {
  const { t } = useI18nStore();
  const finalTitle = title ?? t('noDataAvailable');
  const finalDescription = description ?? t('noItemsMatched');

  return (
    <div className="flex flex-col items-center justify-center rounded-panel border border-dashed border-panel-line bg-panel-surface/40 px-6 py-12 text-center">
      {icon ? (
        <div className="mb-4 text-panel-muted">{icon}</div>
      ) : (
        <svg
          className="mx-auto h-12 w-12 text-panel-muted/60 mb-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          role="img"
          aria-label="No Data"
        >
          <title>No Data</title>
          <path
            d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
          />
        </svg>
      )}
      <h3 className="text-base font-semibold text-panel-text">{finalTitle}</h3>
      <p className="mt-2 max-w-sm text-sm text-panel-muted">{finalDescription}</p>
      {action ? (
        <div className="mt-6">
          <Button onPress={action.onPress} size="sm">
            {action.label}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
