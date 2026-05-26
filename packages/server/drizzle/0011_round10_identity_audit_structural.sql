-- Round 10: Identity & Audit Structural Tables - Phase 3
-- Goal: Migrate identity and audit domains off store_snapshot onto structured PostgreSQL tables.
--
-- Changes:
--   1. Create sequences for ID generation (users, teams, memberships, sessions, access keys, audit events)
--   2. Create structured tables: users, teams, memberships, sessions, access_keys, audit_events
--   3. Create indexes for query patterns (lookup by handle, slug, token_hash, foreign keys)
--
-- Rollback: DROP TABLE audit_events, access_keys, sessions, memberships, teams, users;
--           DROP SEQUENCE IF EXISTS user_id_seq, team_id_seq, membership_id_seq,
--                               session_id_seq, access_key_id_seq, audit_event_id_seq;

-- =============================================================================
-- 1. Create ID generation sequences
-- =============================================================================
CREATE SEQUENCE IF NOT EXISTS "user_id_seq" START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS "team_id_seq" START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS "membership_id_seq" START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS "session_id_seq" START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS "access_key_id_seq" START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS "audit_event_id_seq" START WITH 1 INCREMENT BY 1;

-- =============================================================================
-- 2. Create structured identity & audit tables
-- =============================================================================

-- Users table
CREATE TABLE IF NOT EXISTS "users" (
  "id" TEXT PRIMARY KEY,
  "handle" TEXT NOT NULL UNIQUE,
  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Teams table
CREATE TABLE IF NOT EXISTS "teams" (
  "id" TEXT PRIMARY KEY,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "teams_slug_uidx" ON "teams" ("slug");

-- Memberships table
CREATE TABLE IF NOT EXISTS "memberships" (
  "id" TEXT PRIMARY KEY,
  "user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "team_id" TEXT NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
  "role_template" TEXT NOT NULL,
  "security_level" INTEGER NOT NULL,
  "permissions" JSONB NOT NULL,
  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("user_id", "team_id")
);

CREATE INDEX IF NOT EXISTS "memberships_user_id_idx" ON "memberships" ("user_id");
CREATE INDEX IF NOT EXISTS "memberships_team_id_idx" ON "memberships" ("team_id");

-- Sessions table
CREATE TABLE IF NOT EXISTS "sessions" (
  "id" TEXT PRIMARY KEY,
  "token_hash" TEXT NOT NULL UNIQUE,
  "user_id" TEXT REFERENCES "users"("id"),
  "active_team_id" TEXT REFERENCES "teams"("id"),
  "subject_type" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "sessions_token_hash_idx" ON "sessions" ("token_hash");
CREATE INDEX IF NOT EXISTS "sessions_user_id_idx" ON "sessions" ("user_id");

-- Access keys table
CREATE TABLE IF NOT EXISTS "access_keys" (
  "id" TEXT PRIMARY KEY,
  "member_id" TEXT NOT NULL REFERENCES "memberships"("id"),
  "token_hash" TEXT NOT NULL UNIQUE,
  "token_preview" TEXT NOT NULL,
  "issued_by_user_id" TEXT NOT NULL REFERENCES "users"("id"),
  "team_id" TEXT NOT NULL REFERENCES "teams"("id"),
  "level" INTEGER NOT NULL,
  "notes" TEXT,
  "revoked_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "access_keys_token_hash_idx" ON "access_keys" ("token_hash");
CREATE INDEX IF NOT EXISTS "access_keys_member_id_idx" ON "access_keys" ("member_id");
CREATE INDEX IF NOT EXISTS "access_keys_team_id_idx" ON "access_keys" ("team_id");
CREATE INDEX IF NOT EXISTS "access_keys_issued_by_user_id_idx" ON "access_keys" ("issued_by_user_id");

-- Audit events table
CREATE TABLE IF NOT EXISTS "audit_events" (
  "id" TEXT PRIMARY KEY,
  "team_id" TEXT,
  "actor_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "entity_id" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "audit_events_team_id_idx" ON "audit_events" ("team_id");
CREATE INDEX IF NOT EXISTS "audit_events_actor_id_idx" ON "audit_events" ("actor_id");
CREATE INDEX IF NOT EXISTS "audit_events_action_idx" ON "audit_events" ("action");
CREATE INDEX IF NOT EXISTS "audit_events_entity_id_idx" ON "audit_events" ("entity_id");
CREATE INDEX IF NOT EXISTS "audit_events_created_at_idx" ON "audit_events" ("created_at");
