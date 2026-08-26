CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TABLE "experience_genes" (
  "id" text PRIMARY KEY NOT NULL,
  "schema_version" text NOT NULL,
  "status" text NOT NULL,
  "title" text NOT NULL,
  "signals_match" jsonb NOT NULL,
  "summary" text NOT NULL,
  "strategy" jsonb NOT NULL,
  "avoid" jsonb NOT NULL,
  "constraints" jsonb NOT NULL,
  "validation" jsonb NOT NULL,
  "labels" jsonb NOT NULL,
  "scope" text NOT NULL,
  "team_id" text,
  "required_level" integer NOT NULL,
  "source_type" text NOT NULL,
  "source_id" text NOT NULL,
  "source_revision" integer NOT NULL,
  "source_hash" text NOT NULL,
  "artifact_id" text,
  "capsule_id" text,
  "artifact_revision" integer,
  "derivation_unit_id" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "content_hash" text NOT NULL,
  "parent_event_id" text,
  "prior_gene_hash" text,
  "generator_kind" text NOT NULL,
  "generator_model" text,
  "prompt_version" text NOT NULL,
  "index_status" text NOT NULL,
  "index_last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ck_experience_genes_schema_version" CHECK ("experience_genes"."schema_version" = '1'),
  CONSTRAINT "ck_experience_genes_status" CHECK ("experience_genes"."status" IN ('candidate', 'validated', 'solidified', 'stale', 'deprecated')),
  CONSTRAINT "ck_experience_genes_source_kind" CHECK ("experience_genes"."source_type" IN ('trap', 'skill-artifact', 'skill-capsule')),
  CONSTRAINT "ck_experience_genes_scope" CHECK ("experience_genes"."scope" IN ('global', 'project')),
  CONSTRAINT "ck_experience_genes_generator_kind" CHECK ("experience_genes"."generator_kind" IN ('rule', 'llm', 'hybrid')),
  CONSTRAINT "ck_experience_genes_index_status" CHECK ("experience_genes"."index_status" IN ('pending', 'ready', 'failed'))
);--> statement-breakpoint
CREATE TABLE "experience_gene_events" (
  "id" text PRIMARY KEY NOT NULL,
  "gene_id" text NOT NULL,
  "type" text NOT NULL,
  "source_type" text NOT NULL,
  "source_id" text NOT NULL,
  "source_revision" integer NOT NULL,
  "source_hash" text NOT NULL,
  "actor_kind" text NOT NULL,
  "actor_id" text,
  "validator_summary" jsonb NOT NULL,
  "reason_class" text,
  "payload_snapshot_hash" text NOT NULL,
  "payload" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  CONSTRAINT "ck_experience_gene_events_type" CHECK ("experience_gene_events"."type" IN ('derived', 'validated', 'rejected', 'solidified', 'staled', 'deprecated', 'index-failed')),
  CONSTRAINT "ck_experience_gene_events_actor_kind" CHECK ("experience_gene_events"."actor_kind" IN ('system', 'user', 'agent'))
);--> statement-breakpoint
CREATE TABLE "experience_gene_embeddings" (
  "gene_id" text PRIMARY KEY NOT NULL,
  "content_hash" text NOT NULL,
  "embedding" vector(384) NOT NULL,
  "embedding_model_version" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "last_error" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ck_experience_gene_embeddings_status" CHECK ("experience_gene_embeddings"."status" IN ('pending', 'ready', 'failed'))
);--> statement-breakpoint
CREATE TABLE "experience_gene_search_documents" (
  "gene_id" text PRIMARY KEY NOT NULL,
  "content_hash" text NOT NULL,
  "document" text NOT NULL,
  "labels" text[] DEFAULT '{}' NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "last_error" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ck_experience_gene_search_documents_status" CHECK ("experience_gene_search_documents"."status" IN ('pending', 'ready', 'failed'))
);--> statement-breakpoint
CREATE UNIQUE INDEX "uq_experience_genes_active_idempotency" ON "experience_genes" USING btree ("idempotency_key") WHERE "experience_genes"."status" IN ('candidate', 'validated', 'solidified');--> statement-breakpoint
CREATE INDEX "idx_experience_genes_status_updated" ON "experience_genes" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "idx_experience_genes_source" ON "experience_genes" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "idx_experience_genes_governance" ON "experience_genes" USING btree ("scope","team_id","required_level");--> statement-breakpoint
CREATE INDEX "idx_experience_gene_events_gene_time" ON "experience_gene_events" USING btree ("gene_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_experience_gene_embeddings_content_hash" ON "experience_gene_embeddings" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "idx_experience_gene_embeddings_vector_hnsw" ON "experience_gene_embeddings" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "idx_experience_gene_search_documents_content_hash" ON "experience_gene_search_documents" USING btree ("content_hash");--> statement-breakpoint
ALTER TABLE "experience_gene_search_documents" ALTER COLUMN "document" TYPE tsvector USING to_tsvector('english', "document");--> statement-breakpoint
CREATE INDEX "idx_experience_gene_search_documents_document_gin" ON "experience_gene_search_documents" USING gin ("document");
