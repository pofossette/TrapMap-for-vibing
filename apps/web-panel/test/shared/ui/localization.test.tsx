import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';

import { EmptyState } from '../../../src/shared/ui/empty-state';
import { SectionHeader } from '../../../src/shared/ui/section-header';
import { TimelineItem } from '../../../src/shared/ui/timeline-item';

describe('shared ui localization', () => {
  beforeEach(async () => {
    const { useI18nStore } = await import('@trapmap/web-panel/stores/i18n-store');
    useI18nStore.getState().setLanguage('cn');
  });

  it('renders shared fallbacks in Chinese', () => {
    const markup = renderToStaticMarkup(<EmptyState />);

    expect(markup).toContain('暂无数据');
    expect(markup).toContain('没有找到符合筛选条件的条目。');
    expect(markup).not.toContain('No Data');
  });

  it('does not hardcode TrapMap Console in section header', () => {
    const markup = renderToStaticMarkup(<SectionHeader title="示例标题" />);

    expect(markup).toContain('示例标题');
    expect(markup).not.toContain('TrapMap Console');
  });

  it('does not render English timeline byline', () => {
    const markup = renderToStaticMarkup(
      <TimelineItem
        actor="reviewer@trapmap.local"
        description="已完成审核。"
        timestamp="2026-06-19 09:58"
        title="审核已批准"
        typeLabel="判定决策"
      />,
    );

    expect(markup).not.toContain('By ');
    expect(markup).toContain('reviewer@trapmap.local');
  });
});
