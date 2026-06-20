import { useI18nStore } from '@trapmap/web-panel/stores/i18n-store';
import type { ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { StatusBadge } from './status-badge';

type TimelineItemProps = {
  actor: string;
  description: string;
  linkTo?: string | undefined;
  timestamp: string;
  title: string;
  tone?: 'danger' | 'neutral' | 'success' | 'warning' | undefined;
  typeLabel: string;
};

export function TimelineItem({
  actor,
  description,
  linkTo,
  timestamp,
  title,
  tone = 'neutral',
  typeLabel,
}: TimelineItemProps): ReactElement {
  const { t } = useI18nStore();

  return (
    <article className="relative border-l border-panel-line pl-7 pb-6 last:pb-0">
      <span className="absolute -left-[7px] top-2 h-3 w-3 rounded-full border border-panel-line bg-panel-surface ring-4 ring-panel-bg" />

      <div className="rounded-2xl border border-panel-line bg-panel-surface p-4 shadow-panel transition">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="font-semibold text-panel-text text-sm sm:text-base">{title}</h4>
          <StatusBadge tone={tone}>{typeLabel}</StatusBadge>
        </div>
        <p className="mt-1.5 text-xs text-panel-muted">
          By <span className="font-medium text-panel-text">{actor}</span> · {timestamp}
        </p>
        <p className="mt-3 text-sm leading-6 text-panel-muted/95">{description}</p>

        {linkTo ? (
          <div className="mt-3 flex justify-end">
            <Link
              className="text-xs font-semibold text-panel-accent hover:underline flex items-center gap-1"
              to={linkTo}
            >
              {t('viewRelatedEntry')}
              <svg
                className="h-3 w-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                role="img"
                aria-label="Link"
              >
                <title>Link</title>
                <path
                  d="M9 5l7 7-7 7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                />
              </svg>
            </Link>
          </div>
        ) : null}
      </div>
    </article>
  );
}
