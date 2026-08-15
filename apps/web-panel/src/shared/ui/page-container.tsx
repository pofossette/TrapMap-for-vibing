import type { PropsWithChildren, ReactElement } from 'react';

type PageContainerProps = PropsWithChildren<{
  className?: string;
}>;

export function PageContainer({ children, className = '' }: PageContainerProps): ReactElement {
  return <div className={`w-full space-y-6 pb-12 ${className}`}>{children}</div>;
}
