import type { PropsWithChildren, ReactElement } from 'react';

type StatusPillProps = PropsWithChildren<{
  tone: 'danger' | 'success' | 'warning';
}>;

const toneClasses: Record<StatusPillProps['tone'], string> = {
  success: 'border-emerald-500/30 bg-emerald-500/12 text-emerald-200',
  warning: 'border-amber-500/30 bg-amber-500/12 text-amber-200',
  danger: 'border-rose-500/30 bg-rose-500/12 text-rose-200',
};

export function StatusPill({ children, tone }: StatusPillProps): ReactElement {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${toneClasses[tone]}`}
    >
      {children}
    </span>
  );
}
