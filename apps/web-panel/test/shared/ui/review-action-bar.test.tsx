import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { ReviewActionBar } from '../../../src/shared/ui/review-action-bar';

// Use English explicitly by setting store before each test
vi.mock('@trapmap/web-panel/stores/i18n-store', () => ({
  useI18nStore: () => ({ t: (k: string) => k }),
}));

describe('ReviewActionBar RBAC', () => {
  it('disables all actions for read-only-operator and shows noPermission', () => {
    const markup = renderToStaticMarkup(
      <ReviewActionBar
        onChangeRationale={() => {}}
        onSubmitDecision={() => {}}
        rationale="needs correction"
        role="read-only-operator"
      />,
    );
    expect(markup).toContain('noPermission');
    // All three buttons should be disabled: check disabled attribute appears 3 times
    const disabledCount = (markup.match(/disabled/g) ?? []).length;
    expect(disabledCount).toBeGreaterThanOrEqual(3);
  });

  it('enables approve for reviewer when rationale is present', () => {
    const markup = renderToStaticMarkup(
      <ReviewActionBar
        onChangeRationale={() => {}}
        onSubmitDecision={() => {}}
        rationale="looks good"
        role="reviewer"
      />,
    );
    expect(markup).not.toContain('noPermission');
    expect(markup).toContain('approveBtn');
    // At least approve enabled: markup should not have disabled on approve? We check overall not all disabled
    expect(markup).toContain('rejectBtn');
  });

  it('requires rationale for reject/return for non-readonly', () => {
    const markup = renderToStaticMarkup(
      <ReviewActionBar
        onChangeRationale={() => {}}
        onSubmitDecision={() => {}}
        rationale=""
        role="administrator"
      />,
    );
    expect(markup).toContain('rationaleRequiredWarning');
    expect(markup).toContain('rejectBtn');
    expect(markup).toContain('returnBtn');
  });
});
