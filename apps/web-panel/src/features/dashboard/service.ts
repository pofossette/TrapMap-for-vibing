import { mapRuntimeOverview } from '@trapmap/web-panel/services/mappers/runtime-status-mapper';
import type {
  AdminPanelApiContract,
  GraphDataResponse,
  RuntimeOverview,
} from '@trapmap/web-panel/shared/enum-types';

export type DashboardGraphStats = {
  edges: number;
  nodes: number;
};

export type DashboardScale = {
  capsules: number;
  skillArtifacts: number;
  traps: number;
};

export type DashboardSnapshot = {
  overview: RuntimeOverview;
  scale: DashboardScale;
  skillGraph: GraphDataResponse;
  trapGraph: GraphDataResponse;
};

const emptyGraph: GraphDataResponse = { nodes: [], edges: [] };
const DASHBOARD_ARTIFACT_SNAPSHOT_LIMIT = 100;

function countCapsules(
  artifacts: Array<{ history: Array<{ derived?: { capsules?: unknown[] } | null }> }>,
): number {
  return artifacts.reduce((total, artifact) => {
    const revisionCapsules = artifact.history.map(
      (revision) => revision.derived?.capsules?.length ?? 0,
    );
    return total + revisionCapsules.reduce((revisionTotal, count) => revisionTotal + count, 0);
  }, 0);
}

function hasDerivedRevision(artifact: {
  history: Array<{ derived?: unknown }>;
}): boolean {
  return artifact.history.some((revision) => Boolean(revision.derived));
}

async function loadRuntimeOverview(api: AdminPanelApiContract): Promise<RuntimeOverview> {
  const response = await api.loadRuntimeOverview();
  return mapRuntimeOverview(response);
}

export async function loadDashboardSnapshot(
  api: AdminPanelApiContract,
): Promise<DashboardSnapshot> {
  const [overview, trapGraph, artifacts] = await Promise.all([
    loadRuntimeOverview(api),
    api.loadTrapGraph(),
    api.loadArtifacts({ limit: DASHBOARD_ARTIFACT_SNAPSHOT_LIMIT }),
  ]);
  const primaryArtifact =
    artifacts.items.find((artifact) => hasDerivedRevision(artifact)) ?? artifacts.items[0] ?? null;
  const skillGraph = primaryArtifact
    ? await api.loadSkillGraph(primaryArtifact.id, { mode: 'derivation' })
    : emptyGraph;

  return {
    overview,
    trapGraph,
    skillGraph,
    scale: {
      traps: trapGraph.nodes.filter((node) => node.kind === 'trap').length,
      skillArtifacts: artifacts.total,
      capsules: countCapsules(artifacts.items),
    },
  };
}
