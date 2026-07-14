import type { LiveEvalServiceProfile } from '@trapmap/contracts/evals';

type CorpusRecord = Record<string, unknown>;

interface CorpusRepos {
  knowledge: { insert(record: CorpusRecord): Promise<unknown> };
  artifact: { insert(record: CorpusRecord): Promise<unknown> };
  graphIndex: { upsert(record: CorpusRecord): Promise<unknown> };
}

export async function materializeCorpusRecords(
  repos: CorpusRepos,
  corpus: Record<string, unknown>,
  toKnowledgeRecord: (entry: CorpusRecord) => CorpusRecord = (entry) => entry,
): Promise<void> {
  const entries = (corpus.knowledgeEntries ?? []) as CorpusRecord[];
  for (const entry of entries) {
    await repos.knowledge.insert(toKnowledgeRecord(entry));
  }

  const artifacts = (corpus.skillArtifacts ?? []) as CorpusRecord[];
  for (const artifact of artifacts) {
    await repos.artifact.insert(artifact);
  }

  const graphDocs = (corpus.graphIndexDocuments ?? []) as CorpusRecord[];
  for (const doc of graphDocs) {
    await repos.graphIndex.upsert(doc);
  }
}

export function detectServiceProfile(): LiveEvalServiceProfile {
  return {
    embeddingModel: process.env.OPENAI_API_KEY
      ? 'text-embedding-3-small'
      : (process.env.AI_EMBEDDING_MODEL ?? 'fallback-hash'),
    useDbSearch: process.env.USE_DB_SEARCH === 'true',
    capsulePgKeyword: process.env.RETRIEVAL_CAPSULE_PG_KEYWORD === 'true',
    capsulePgSemantic: process.env.RETRIEVAL_CAPSULE_PG_SEMANTIC === 'true',
    graphDbEnabled: process.env.TRAPMAP_GRAPH_DB_ENABLED === 'true',
    graphDbProvider:
      process.env.TRAPMAP_GRAPH_DB_ENABLED === 'true'
        ? (process.env.TRAPMAP_GRAPH_DB_PROVIDER ?? 'neo4j')
        : null,
    decayEnabled: process.env.TRAPMAP_DECAY_ENABLED === 'true',
  };
}
