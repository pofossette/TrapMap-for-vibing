// fallow-ignore-file boundary-violation -- Drizzle-only local baseline entry mirrors the frozen schema.
export {
  knowledgeEmbeddings,
  knowledgeKeywords,
  knowledgeSearchDocuments,
} from '../../server/src/lib/persistence/schema/knowledge.js';
export { canonicalLabelEmbeddings } from '../../server/src/lib/persistence/schema/labels.js';
export {
  skillArtifactCapsuleEmbeddings,
  skillArtifactCapsuleKeywords,
} from '../../server/src/lib/persistence/schema/artifacts.js';
export {
  graphIndexDocuments,
  retrievalBadcaseTraces,
} from '../../server/src/lib/persistence/schema/retrieval.js';
