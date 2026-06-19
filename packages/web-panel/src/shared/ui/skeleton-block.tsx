import { Skeleton } from '@heroui/react';
import type { ReactElement } from 'react';

type SkeletonBlockProps = {
  count?: number;
  variant?: 'card' | 'line' | 'table';
};

export function SkeletonBlock({ count = 1, variant = 'line' }: SkeletonBlockProps): ReactElement {
  const items = Array.from({ length: count });

  if (variant === 'card') {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {items.map((_, i) => (
          <Skeleton className="rounded-panel" key={i}>
            <div className="h-32 rounded-panel bg-panel-elevated" />
          </Skeleton>
        ))}
      </div>
    );
  }

  if (variant === 'table') {
    return (
      <div className="space-y-4">
        <Skeleton className="rounded-2xl">
          <div className="h-10 bg-panel-elevated" />
        </Skeleton>
        {items.map((_, i) => (
          <Skeleton className="rounded-2xl" key={i}>
            <div className="h-16 bg-panel-elevated" />
          </Skeleton>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((_, i) => (
        <Skeleton className="rounded-xl" key={i}>
          <div className="h-6 bg-panel-elevated" />
        </Skeleton>
      ))}
    </div>
  );
}
