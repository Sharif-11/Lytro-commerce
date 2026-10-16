CREATE TABLE IF NOT EXISTS "tenant"."data_exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"file_content" "bytea",
	"file_size_bytes" bigint,
	"content_type" text,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ready_at" timestamp with time zone,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "data_exports_tenant_requested_idx" ON "tenant"."data_exports" USING btree ("tenant_id","created_at");
--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------
-- Hand-written security and grants (not expressible in Drizzle). Reviewed with the schema above.
-- ---------------------------------------------------------------------------------------------

-- LIF-16/17: tenant isolation, same shape every other tenant-schema table uses. Unlike activity_log/
-- balance_ledger this is not insert-only -- the worker updates a row once (pending -> ready|failed) and
-- LIF-19's day-60 job deletes it, so no tenant.reject_mutation() trigger here.
ALTER TABLE "tenant"."data_exports" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tenant"."data_exports" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "tenant"."data_exports"
  USING (tenant_id = tenant.current_tenant_id())
  WITH CHECK (tenant_id = tenant.current_tenant_id());
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.data_exports TO lytronix_app;
  END IF;
END $$;