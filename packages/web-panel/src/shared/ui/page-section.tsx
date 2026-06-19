import type { PropsWithChildren, ReactElement } from 'react';

type PageSectionProps = PropsWithChildren<{
  description: string;
  title: string;
}>;

export function PageSection({ children, description, title }: PageSectionProps): ReactElement {
  return (
    <section className="space-y-5">
      <header>
        <p className="text-xs uppercase tracking-[0.24em] text-panel-muted">Web Panel</p>
        <h1 className="mt-2 text-3xl font-semibold">{title}</h1>
        <p className="mt-2 max-w-3xl text-sm text-panel-muted">{description}</p>
      </header>
      {children}
    </section>
  );
}
