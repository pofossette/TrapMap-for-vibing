import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { SkillGraphPage } from './skill-graph/skill-graph-page';
import { TrapGraphPage } from './trap-graph/trap-graph-page';

vi.mock('@trapmap/web-panel/services/admin-panel-service-context', () => ({
  getAdminPanelApi: () => ({
    loadTrapGraph: vi.fn(async () => ({ nodes: [], edges: [] })),
    loadArtifacts: vi.fn(async () => ({
      items: [{ id: 'artifact-1', title: 'Artifact One' }],
    })),
    loadSkillGraph: vi.fn(async () => ({ nodes: [], edges: [] })),
  }),
}));

vi.mock('@trapmap/web-panel/shared/ui', async () => {
  const actual = await vi.importActual<object>('@trapmap/web-panel/shared/ui');
  return {
    ...actual,
    G6GraphComponent: () => <div data-testid="mock-graph" />,
  };
});

// @ts-ignore
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('graph page controls', () => {
  beforeAll(async () => {
    const { useI18nStore } = await import('@trapmap/web-panel/stores/i18n-store');
    useI18nStore.getState().setLanguage('en');
  });

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders the trap graph neighborhood depth control without a native select', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<TrapGraphPage />);
    });

    expect(container.textContent).toContain('Neighborhood Depth');
    expect(container.querySelector('select.rounded-xl')).toBeNull();
    expect(
      Array.from(container.querySelectorAll('button')).some((button) =>
        button.textContent?.includes('1-Hop Neighbors'),
      ),
    ).toBe(true);

    await act(async () => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it('renders the skill graph artifact picker without a native select', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <MemoryRouter>
          <SkillGraphPage />
        </MemoryRouter>,
      );
    });

    expect(container.textContent).toContain('Artifact:');
    expect(container.querySelector('select.flex-1')).toBeNull();
    expect(
      Array.from(container.querySelectorAll('button')).some((button) =>
        button.textContent?.includes('Artifact One'),
      ),
    ).toBe(true);

    await act(async () => {
      root.unmount();
    });
    document.body.removeChild(container);
  });
});
