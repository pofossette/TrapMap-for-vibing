import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  type RetrievalEvalActor,
  type RetrievalEvalScenario,
  retrievalEvalScenarioSnapshotSchema,
} from '@trapmap/contracts/evals';

export async function hydrateScenarioSnapshot(
  scenario: RetrievalEvalScenario,
): Promise<RetrievalEvalScenario> {
  if (!scenario.snapshot) {
    return scenario;
  }

  const snapshotPath = path.isAbsolute(scenario.snapshot.path)
    ? scenario.snapshot.path
    : path.resolve(process.cwd(), scenario.snapshot.path);
  const rawSnapshot = await readFile(snapshotPath, 'utf8');
  const parsed = retrievalEvalScenarioSnapshotSchema.parse(JSON.parse(rawSnapshot));

  return {
    ...scenario,
    actor: mergeActor(scenario.actor, parsed.actor),
    fixtures: {
      knowledgeEntries: parsed.fixtures.knowledgeEntries,
      skillArtifacts: parsed.fixtures.skillArtifacts,
      graphIndexDocuments: parsed.fixtures.graphIndexDocuments,
    },
  };
}

function mergeActor(
  scenarioActor: RetrievalEvalActor,
  snapshotActor?: RetrievalEvalActor,
): RetrievalEvalActor {
  if (!snapshotActor) {
    return scenarioActor;
  }

  return {
    ...snapshotActor,
    ...scenarioActor,
    permissions:
      scenarioActor.permissions.length > 0 ? scenarioActor.permissions : snapshotActor.permissions,
  };
}
