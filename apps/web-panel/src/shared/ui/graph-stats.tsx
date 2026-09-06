import { useI18nStore } from '@trapmap/web-panel/stores/i18n-store';
import type { ReactElement } from 'react';

export function GraphStats({
  edgeCount,
  nodeCount,
}: {
  edgeCount: number;
  nodeCount: number;
}): ReactElement {
  const { t } = useI18nStore();
  return (
    <div className="mt-auto pt-4 border-t border-panel-line/35 text-xs text-panel-muted space-y-2">
      <p className="font-semibold uppercase tracking-wider">{t('graphStats')}</p>
      <div className="grid grid-cols-2 gap-y-1 text-[11px] font-mono">
        <span>{t('nodes')}:</span>
        <span className="text-panel-text text-right">{nodeCount}</span>
        <span>{t('edges')}:</span>
        <span className="text-panel-text text-right">{edgeCount}</span>
      </div>
    </div>
  );
}
