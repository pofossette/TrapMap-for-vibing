import type { ReactElement, ReactNode } from 'react';

type SectionHeaderProps = {
  actions?: ReactNode;
  description?: string;
  title: string;
};

export function SectionHeader({ actions, description, title }: SectionHeaderProps): ReactElement {
  return (
    <div className="mb-5 flex flex-col gap-4 border-b border-panel-line pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-2">
        <span className="inline-flex rounded-full border border-panel-line bg-panel-surface px-3 py-1 font-mono text-[12px] font-medium uppercase tracking-normal text-panel-muted">
          TrapMap Console
        </span>
        <div>
          <h2 className="text-[32px] font-semibold leading-10 tracking-[-1.28px] text-panel-text">
            {title}
          </h2>
          {description ? (
            <p className="mt-2 max-w-2xl text-sm leading-6 text-panel-muted">{description}</p>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
