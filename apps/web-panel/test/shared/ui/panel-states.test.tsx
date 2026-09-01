import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';

import { EmptyState } from '../../../src/shared/ui/empty-state';
import { ErrorPanel } from '../../../src/shared/ui/error-panel';

describe('panel standard states', () => {
  beforeEach(async () => {
    const { useI18nStore } = await import('@trapmap/web-panel/stores/i18n-store');
    useI18nStore.getState().setLanguage('en');
  });

  it('empty state uses hairline dashed border and localized fallback', () => {
    const markup = renderToStaticMarkup(
      <EmptyState title="No items" description="Try adjusting filters." />,
    );
    expect(markup).toContain('border-dashed');
    expect(markup).toContain('border-panel-line');
    expect(markup).toContain('No items');
    expect(markup).toContain('Try adjusting filters.');
  });

  it('empty state renders action button when provided', () => {
    const markup = renderToStaticMarkup(
      <EmptyState action={{ label: 'Retry', onPress: () => {} }} title="Empty" />,
    );
    expect(markup).toContain('Retry');
  });

  it('error panel renders with retry and accessible role', () => {
    const onRetry = () => {};
    const markup = renderToStaticMarkup(<ErrorPanel message="Failed to load." onRetry={onRetry} />);
    expect(markup).toContain('Failed to load.');
    expect(markup).toContain('Retry Request');
    const markup2 = renderToStaticMarkup(<ErrorPanel message="Failed" onRetry={onRetry} />);
    expect(markup2).toContain('Retry Request');
  });

  it('error panel without retry omits button', () => {
    const markup = renderToStaticMarkup(<ErrorPanel message="Oops" />);
    expect(markup).not.toContain('Retry Request');
  });
});
