CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TABLE "canonical_label_embeddings" (
	"canonical_label_id" text PRIMARY KEY NOT NULL,
	"vector" vector(384) NOT NULL,
	"content_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "graph_index_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"revision_no" integer NOT NULL,
	"content_hash" text NOT NULL,
	"team_id" text,
	"scope" text NOT NULL,
	"required_level" integer DEFAULT 0 NOT NULL,
	"nodes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"edges" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_graph_index_documents_source_type" CHECK ("graph_index_documents"."source_type" IN ('trap', 'skill')),
	CONSTRAINT "ck_graph_index_documents_scope" CHECK ("graph_index_documents"."scope" IN ('global', 'project'))
);
--> statement-breakpoint
CREATE TABLE "knowledge_embeddings" (
	"id" text PRIMARY KEY NOT NULL,
	"entry_id" text NOT NULL,
	"revision_no" integer NOT NULL,
	"content_hash" text NOT NULL,
	"vector" vector(384) NOT NULL,
	"team_id" text,
	"scope" text NOT NULL,
	"required_level" integer DEFAULT 0 NOT NULL,
	"labels" text[] DEFAULT '{}' NOT NULL,
	"status" text DEFAULT 'synced' NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_keywords" (
	"id" text PRIMARY KEY NOT NULL,
	"entry_id" text NOT NULL,
	"revision_no" integer NOT NULL,
	"content_hash" text NOT NULL,
	"tokens" text[] DEFAULT '{}' NOT NULL,
	"field_tokens_shortcut" text[] DEFAULT '{}' NOT NULL,
	"field_tokens_detail" text[] DEFAULT '{}' NOT NULL,
	"field_tokens_labels" text[] DEFAULT '{}' NOT NULL,
	"team_id" text,
	"scope" text NOT NULL,
	"required_level" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'synced' NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_search_documents" (
	"entry_id" text NOT NULL,
	"revision_no" integer NOT NULL,
	"document" text NOT NULL,
	"labels" text[] DEFAULT '{}' NOT NULL,
	"status" text DEFAULT 'synced' NOT NULL,
	"last_error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_search_documents_entry_id_revision_no_pk" PRIMARY KEY("entry_id","revision_no")
);
--> statement-breakpoint
CREATE TABLE "retrieval_badcase_traces" (
	"id" text PRIMARY KEY NOT NULL,
	"feedback_id" text NOT NULL,
	"query_id" text,
	"query_seed" text,
	"route_family" text,
	"entry_id" text NOT NULL,
	"entry_type" text NOT NULL,
	"failure_classification" text,
	"expected_correction" text,
	"selected_result_snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_retrieval_badcase_entry_type" CHECK ("retrieval_badcase_traces"."entry_type" IN ('trap', 'skill')),
	CONSTRAINT "ck_retrieval_badcase_route_family" CHECK ("retrieval_badcase_traces"."route_family" IS NULL OR "retrieval_badcase_traces"."route_family" IN ('entry', 'capsule', 'graph-plan'))
);
--> statement-breakpoint
CREATE TABLE "skill_artifact_capsule_embeddings" (
	"capsule_id" text PRIMARY KEY NOT NULL,
	"artifact_id" text NOT NULL,
	"revision_no" integer NOT NULL,
	"team_id" text,
	"scope" text NOT NULL,
	"required_level" integer NOT NULL,
	"status" text DEFAULT 'synced' NOT NULL,
	"embedding" vector(384) NOT NULL,
	"content_hash" text NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_skill_artifact_capsule_embeddings_scope" CHECK ("skill_artifact_capsule_embeddings"."scope" IN ('global', 'project'))
);
--> statement-breakpoint
CREATE TABLE "skill_artifact_capsule_keywords" (
	"capsule_id" text PRIMARY KEY NOT NULL,
	"artifact_id" text NOT NULL,
	"revision_no" integer NOT NULL,
	"team_id" text,
	"scope" text NOT NULL,
	"required_level" integer NOT NULL,
	"status" text DEFAULT 'synced' NOT NULL,
	"tokens" text[] DEFAULT '{}' NOT NULL,
	"field_tokens_content" text[] DEFAULT '{}' NOT NULL,
	"field_tokens_situation" text[] DEFAULT '{}' NOT NULL,
	"field_tokens_problem" text[] DEFAULT '{}' NOT NULL,
	"field_tokens_goal" text[] DEFAULT '{}' NOT NULL,
	"field_tokens_labels" text[] DEFAULT '{}' NOT NULL,
	"field_tokens_contextual_prefix" text[] DEFAULT '{}' NOT NULL,
	"content_hash" text NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_skill_artifact_capsule_keywords_scope" CHECK ("skill_artifact_capsule_keywords"."scope" IN ('global', 'project'))
);
--> statement-breakpoint
CREATE INDEX "idx_canonical_label_embeddings_hash" ON "canonical_label_embeddings" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "idx_graph_index_documents_source" ON "graph_index_documents" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_graph_index_documents_source_revision_no" ON "graph_index_documents" USING btree ("source_type","source_id","revision_no");--> statement-breakpoint
CREATE INDEX "idx_graph_index_documents_team" ON "graph_index_documents" USING btree ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_embeddings_entry_revision_no_idx" ON "knowledge_embeddings" USING btree ("entry_id","revision_no");--> statement-breakpoint
CREATE INDEX "idx_knowledge_embeddings_status" ON "knowledge_embeddings" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_keywords_entry_revision_no_idx" ON "knowledge_keywords" USING btree ("entry_id","revision_no");--> statement-breakpoint
CREATE INDEX "idx_knowledge_keywords_tokens_gin" ON "knowledge_keywords" USING gin ("tokens");--> statement-breakpoint
CREATE INDEX "idx_knowledge_keywords_status" ON "knowledge_keywords" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_knowledge_search_documents_entry" ON "knowledge_search_documents" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "idx_knowledge_search_documents_status" ON "knowledge_search_documents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_retrieval_badcase_query" ON "retrieval_badcase_traces" USING btree ("query_id");--> statement-breakpoint
CREATE INDEX "idx_retrieval_badcase_feedback" ON "retrieval_badcase_traces" USING btree ("feedback_id");--> statement-breakpoint
CREATE INDEX "idx_retrieval_badcase_entry" ON "retrieval_badcase_traces" USING btree ("entry_id","entry_type");--> statement-breakpoint
CREATE INDEX "idx_capsule_embeddings_artifact_revision" ON "skill_artifact_capsule_embeddings" USING btree ("artifact_id","revision_no");--> statement-breakpoint
CREATE INDEX "idx_capsule_embeddings_status" ON "skill_artifact_capsule_embeddings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_capsule_keywords_artifact_revision" ON "skill_artifact_capsule_keywords" USING btree ("artifact_id","revision_no");--> statement-breakpoint
CREATE INDEX "idx_capsule_keywords_tokens_gin" ON "skill_artifact_capsule_keywords" USING gin ("tokens");--> statement-breakpoint
CREATE INDEX "idx_capsule_keywords_status" ON "skill_artifact_capsule_keywords" USING btree ("status");
