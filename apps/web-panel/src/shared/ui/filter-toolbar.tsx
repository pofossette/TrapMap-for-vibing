import type { PropsWithChildren, ReactElement } from 'react';

type FilterToolbarProps = PropsWithChildren<{
  className?: string;
}>;

export function FilterToolbar({ children, className = '' }: FilterToolbarProps): ReactElement {
  return (
    <div
      className={`grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 p-4 rounded-2xl border border-panel-line bg-panel-elevated/70 backdrop-blur ${className}`}
    >
      {children}
    </div>
  );
}

type FilterItemProps = PropsWithChildren<{
  label: string;
}>;

export function FilterItem({ label, children }: FilterItemProps): ReactElement {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-panel-muted">
        {label}
      </span>
      <div className="relative">{children}</div>
    </div>
  );
}
