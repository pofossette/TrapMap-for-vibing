import { Card } from '@heroui/react';
import type { ReactElement, ReactNode } from 'react';

type SummaryCardProps = {
  badge?: ReactNode;
  className?: string;
  helpText?: string;
  label: string;
  value: string | number;
};

export function SummaryCard({
  badge,
  className = '',
  helpText,
  label,
  value,
}: SummaryCardProps): ReactElement {
  return (
    <Card
      className={`border border-panel-line bg-panel-surface p-5 shadow-panel transition ${className}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="font-mono text-[12px] font-medium tracking-normal text-panel-muted uppercase">
            {label}
          </p>
          <p className="mt-3 text-3xl font-semibold tracking-[-1.28px] text-panel-text">{value}</p>
        </div>
        {badge ? <div className="shrink-0">{badge}</div> : null}
      </div>
      {helpText ? (
        <p className="mt-4 border-t border-panel-line/50 pt-3 text-xs leading-5 text-panel-muted">
          {helpText}
        </p>
      ) : null}
    </Card>
  );
}
