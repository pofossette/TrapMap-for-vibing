CREATE SEQUENCE "public"."access_key_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."audit_event_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."membership_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."session_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."team_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."user_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "access_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"member_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"token_preview" text NOT NULL,
	"issued_by_user_id" text NOT NULL,
	"team_id" text NOT NULL,
	"level" integer NOT NULL,
	"notes" text,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_keys_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"entity_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"event_version" integer DEFAULT 1 NOT NULL,
	"source_service" text DEFAULT 'server-compatibility-seam' NOT NULL,
	"request_id" text,
	"trace_id" text,
	"operation_id" text,
	"causation_id" text,
	"outcome" text DEFAULT 'success' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"team_id" text NOT NULL,
	"role_template" text NOT NULL,
	"security_level" integer NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" text,
	"active_team_id" text,
	"subject_type" text NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
-- A7 迁移窗口批处理：store_snapshot 幽灵表已从基线移除（Wave-9 退役模块残留，persistence-schema 无此表）
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"handle" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_handle_unique" UNIQUE("handle")
);
--> statement-breakpoint
ALTER TABLE "access_keys" ADD CONSTRAINT "access_keys_member_id_memberships_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_keys" ADD CONSTRAINT "access_keys_issued_by_user_id_users_id_fk" FOREIGN KEY ("issued_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_keys" ADD CONSTRAINT "access_keys_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_active_team_id_teams_id_fk" FOREIGN KEY ("active_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_keys_token_hash_idx" ON "access_keys" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "access_keys_member_id_idx" ON "access_keys" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "access_keys_team_id_idx" ON "access_keys" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "access_keys_issued_by_user_id_idx" ON "access_keys" USING btree ("issued_by_user_id");--> statement-breakpoint
CREATE INDEX "audit_events_team_id_idx" ON "audit_events" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "audit_events_actor_id_idx" ON "audit_events" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_events_action_idx" ON "audit_events" USING btree ("action");--> statement-breakpoint
CREATE INDEX "audit_events_entity_id_idx" ON "audit_events" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "audit_events_request_id_idx" ON "audit_events" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "audit_events_trace_id_idx" ON "audit_events" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX "audit_events_operation_id_idx" ON "audit_events" USING btree ("operation_id");--> statement-breakpoint
CREATE INDEX "audit_events_causation_id_idx" ON "audit_events" USING btree ("causation_id");--> statement-breakpoint
CREATE INDEX "audit_events_created_at_idx" ON "audit_events" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_user_team_uidx" ON "memberships" USING btree ("user_id","team_id");--> statement-breakpoint
CREATE INDEX "memberships_user_id_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "memberships_team_id_idx" ON "memberships" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "sessions_token_hash_idx" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "teams_slug_uidx" ON "teams" USING btree ("slug");