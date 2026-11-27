-- TENANT-DASHBOARD-DESIGN §7.49, §7.49a and OPERATOR-CONSOLE-DESIGN §10h (the owner, 2026-11-27): the in-app tutorial
-- videos. Kind: add -- three new tables, empty: Lytro's control.tutorial_videos (each uploaded version of a tutorial's
-- file) and each shop person's tenant.tutorial_views and tenant.tutorial_dismissals, held to their shop by row-level
-- security. Single-step add: nothing is moved or dropped. The previous release never reads these tables, and a rollback
-- leaves rows nobody reads. The playlist link is a platform setting written by the console; none is seeded.
CREATE TABLE "control"."tutorial_videos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tutorial_key" text NOT NULL,
	"version" integer NOT NULL,
	"video_key" text NOT NULL,
	"cover_key" text NOT NULL,
	"duration_seconds" integer NOT NULL,
	"bytes" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"retired_at" timestamp with time zone,
	"retired_by" uuid,
	"files_deleted_at" timestamp with time zone,
	CONSTRAINT "tutorial_videos_version_key" UNIQUE("tutorial_key","version")
);
--> statement-breakpoint
CREATE TABLE "tenant"."tutorial_dismissals" (
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"screen" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tutorial_dismissals_tenant_id_user_id_screen_pk" PRIMARY KEY("tenant_id","user_id","screen")
);
--> statement-breakpoint
CREATE TABLE "tenant"."tutorial_views" (
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"tutorial_key" text NOT NULL,
	"watched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tutorial_views_tenant_id_user_id_tutorial_key_pk" PRIMARY KEY("tenant_id","user_id","tutorial_key")
);
--> statement-breakpoint
ALTER TABLE "tenant"."tutorial_dismissals" ADD CONSTRAINT "tutorial_dismissals_user_fk" FOREIGN KEY ("tenant_id","user_id") REFERENCES "tenant"."users"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant"."tutorial_views" ADD CONSTRAINT "tutorial_views_user_fk" FOREIGN KEY ("tenant_id","user_id") REFERENCES "tenant"."users"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tutorial_videos_live_idx" ON "control"."tutorial_videos" USING btree ("tutorial_key") WHERE "control"."tutorial_videos"."published_at" IS NOT NULL AND "control"."tutorial_videos"."retired_at" IS NULL;--> statement-breakpoint
CREATE INDEX "tutorial_videos_old_files_idx" ON "control"."tutorial_videos" USING btree ("retired_at") WHERE "control"."tutorial_videos"."retired_at" IS NOT NULL AND "control"."tutorial_videos"."files_deleted_at" IS NULL;
--> statement-breakpoint
ALTER TABLE tenant.tutorial_views ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenant.tutorial_views FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON tenant.tutorial_views USING (tenant_id = tenant.current_tenant_id())
  WITH CHECK (tenant_id = tenant.current_tenant_id());
--> statement-breakpoint
ALTER TABLE tenant.tutorial_dismissals ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenant.tutorial_dismissals FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON tenant.tutorial_dismissals USING (tenant_id = tenant.current_tenant_id())
  WITH CHECK (tenant_id = tenant.current_tenant_id());
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT, UPDATE ON control.tutorial_videos TO lytronix_app;
    GRANT SELECT, INSERT, DELETE ON tenant.tutorial_views, tenant.tutorial_dismissals TO lytronix_app;
  END IF;
END $$;
