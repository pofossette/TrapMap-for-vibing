import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockAdminPanelApi } from '@trapmap/web-panel/services/api/mock-admin-panel-api';

import { SkillGraphPage } from './skill-graph/skill-graph-page';
import { TrapGraphPage } from './trap-graph/trap-graph-page';

const adminApi = vi.hoisted(() => ({
  loadArtifacts: vi.fn(),
  loadSkillGraph: vi.fn(),
  loadTrapGraph: vi.fn(),
}));

vi.mock('@trapmap/web-panel/services/admin-panel-service-context', () => ({
  getAdminPanelApi: () => adminApi,
}));

vi.mock('@trapmap/web-panel/shared/ui', async () => {
  const actual = await vi.importActual<object>('@trapmap/web-panel/shared/ui');
  return {
    ...actual,
    G6GraphComponent: () => <div data-testid="mock-graph" />,
  };
});

vi.mock('../shared/ui/g6-graph-component', () => ({
  G6GraphComponent: () => <div data-testid="mock-graph" />,
}));

// @ts-ignore
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('graph page controls', () => {
  beforeAll(async () => {
    const { useI18nStore } = await import('@trapmap/web-panel/stores/i18n-store');
    useI18nStore.getState().setLanguage('en');
  });

  beforeEach(() => {
    document.body.innerHTML = '';
    const mockApi = createMockAdminPanelApi();
    adminApi.loadArtifacts.mockImplementation((query) => mockApi.loadArtifacts(query));
    adminApi.loadSkillGraph.mockImplementation((artifactId, query) =>
      mockApi.loadSkillGraph(artifactId, query),
    );
    adminApi.loadTrapGraph.mockImplementation(() => mockApi.loadTrapGraph());
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
        button.textContent?.includes('Kubernetes Network Security Policies'),
      ),
    ).toBe(true);
    expect(adminApi.loadArtifacts).toHaveBeenCalledWith({ limit: 100 });

    const semanticButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Semantic Graph'),
    );
    await act(async () => {
      semanticButton?.click();
    });

    expect(
      adminApi.loadSkillGraph.mock.calls.some(([artifactId, query]) => {
        return (
          typeof artifactId === 'string' && artifactId.length > 0 && query?.mode === 'semantic'
        );
      }),
    ).toBe(true);

    await act(async () => {
      root.unmount();
    });
    document.body.removeChild(container);
  });
});
