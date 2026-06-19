import { Chip } from '@heroui/react';
import type { PropsWithChildren, ReactElement } from 'react';

type StatusBadgeProps = PropsWithChildren<{
  tone?: 'danger' | 'neutral' | 'success' | 'warning';
  variant?: 'primary' | 'secondary' | 'tertiary' | 'soft';
}>;

const toneColors: Record<
  NonNullable<StatusBadgeProps['tone']>,
  'accent' | 'danger' | 'default' | 'success' | 'warning'
> = {
  success: 'success',
  warning: 'warning',
  danger: 'danger',
  neutral: 'default',
};

export function StatusBadge({
  children,
  tone = 'neutral',
  variant = 'soft',
}: StatusBadgeProps): ReactElement {
  return (
    <Chip
      className="border border-panel-line bg-panel-surface text-[11px] font-medium text-panel-text shadow-none"
      color={toneColors[tone]}
      variant={variant}
    >
      {children}
    </Chip>
  );
}
