# TrapMap Go Accelerator

Distributed-only acceleration service for TrapMap hotspots.
Enabled only when TRAPMAP_GO_ACCELERATOR_ENABLED=true and TRAPMAP_DEPLOYMENT_PROFILE=distributed.

## Hotspots
- canonical JSON + sha256 (lib/canonical-hash)
- vector cosine similarity / normalize / deterministic fallback vectors
- tokenization + chunking (knowledge-read tokenization)
- retrieval scoring / ranking (knowledge-read ranking, assembly)
- ExperienceGene selection (gene-selection.ts)

## Endpoints
- GET /health, /ready
- POST /v1/hash/canonical { payload: unknown } -> { hash, canonical }
- POST /v1/vector/cosine { a, b } -> { similarity }
- POST /v1/vector/batch-cosine
- POST /v1/text/tokenize { text, maxTokens }
- POST /v1/retrieval/score { entries, query, filters }
- POST /v1/gene/select { candidates, query }

All handlers are concurrency-safe, with request timeouts and structured logging.
