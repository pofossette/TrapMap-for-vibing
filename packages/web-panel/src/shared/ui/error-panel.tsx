import { Button } from '@heroui/react';
import type { ReactElement } from 'react';

type ErrorPanelProps = {
  message: string;
  onRetry?: () => void | Promise<void>;
  title?: string;
};

export function ErrorPanel({
  message,
  onRetry,
  title = 'System Error',
}: ErrorPanelProps): ReactElement {
  return (
    <div className="rounded-panel border border-rose-500/30 bg-rose-500/10 p-5 shadow-panel">
      <div className="flex items-start gap-3">
        <div className="shrink-0 text-rose-400">
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
            />
          </svg>
        </div>
        <div className="flex-1 space-y-1">
          <h3 className="text-sm font-semibold text-rose-200">{title}</h3>
          <p className="text-sm text-rose-100/80 leading-relaxed">{message}</p>
          {onRetry ? (
            <div className="pt-2">
              <Button
                className="border-rose-500/40 bg-rose-500/20 text-rose-100 hover:bg-rose-500/30"
                onPress={onRetry}
                size="sm"
                variant="outline"
              >
                Retry Request
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
