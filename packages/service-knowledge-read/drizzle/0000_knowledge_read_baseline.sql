CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "knowledge_embeddings" ("id" text PRIMARY KEY, "entry_id" text NOT NULL REFERENCES "knowledge_entries"("id") ON DELETE CASCADE, "revision_no" integer NOT NULL, "content_hash" text NOT NULL, "vector" vector(384) NOT NULL, "team_id" text, "scope" text NOT NULL, "required_level" integer NOT NULL DEFAULT 0, "labels" text[] NOT NULL DEFAULT '{}', "status" text NOT NULL DEFAULT 'synced', "last_error" text, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), UNIQUE("entry_id", "revision_no"));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "knowledge_keywords" ("id" text PRIMARY KEY, "entry_id" text NOT NULL REFERENCES "knowledge_entries"("id") ON DELETE CASCADE, "revision_no" integer NOT NULL, "content_hash" text NOT NULL, "tokens" text[] NOT NULL DEFAULT '{}', "team_id" text, "scope" text NOT NULL, "required_level" integer NOT NULL DEFAULT 0, "labels" text[] NOT NULL DEFAULT '{}', "status" text NOT NULL DEFAULT 'synced', "last_error" text, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), UNIQUE("entry_id", "revision_no"));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "knowledge_search_documents" ("id" text PRIMARY KEY, "entry_id" text NOT NULL REFERENCES "knowledge_entries"("id") ON DELETE CASCADE, "content" text NOT NULL, "team_id" text, "created_at" timestamptz NOT NULL DEFAULT now());
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "graph_index_documents" ("id" text PRIMARY KEY, "entry_id" text NOT NULL REFERENCES "knowledge_entries"("id") ON DELETE CASCADE, "revision_no" integer NOT NULL, "document" jsonb NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now());
