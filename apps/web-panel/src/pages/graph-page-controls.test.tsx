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
  G6GraphComponent: ({
    onSelectNode,
  }: {
    onSelectNode: (node: { id: string; kind: string; label: string }) => void;
  }) => (
    <button
      type="button"
      onClick={() => onSelectNode({ id: 'trap-1', kind: 'trap', label: 'Docker socket exposure' })}
    >
      Select trap fixture
    </button>
  ),
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
    adminApi.loadArtifacts.mockClear();
    adminApi.loadSkillGraph.mockClear();
    adminApi.loadTrapGraph.mockClear();
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
    expect(adminApi.loadSkillGraph.mock.calls[0]).toEqual(['art-102', { mode: 'derivation' }]);

    const semanticButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Semantic Graph'),
    );
    adminApi.loadSkillGraph.mockClear();
    await act(async () => {
      semanticButton?.click();
    });

    expect(adminApi.loadSkillGraph).toHaveBeenCalledTimes(1);
    expect(adminApi.loadSkillGraph).toHaveBeenCalledWith('art-102', { mode: 'semantic' });

    await act(async () => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it('clears a selected trap node when its layer filter hides the root', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<TrapGraphPage />);
    });

    const selectFixture = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Select trap fixture'),
    );
    await act(async () => {
      selectFixture?.click();
    });
    expect(container.textContent).toContain('trap-1');

    const trapLayerLabel = Array.from(container.querySelectorAll('label')).find((label) =>
      label.textContent?.includes('Trap (Threat Risks)'),
    );
    const trapCheckbox = trapLayerLabel?.querySelector('input');
    await act(async () => {
      trapCheckbox?.click();
    });

    expect(container.textContent).toContain('Select a node or edge to inspect its details.');
    expect(container.textContent).not.toContain('trap-1');

    await act(async () => {
      root.unmount();
    });
    document.body.removeChild(container);
  });
});
