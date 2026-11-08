CREATE TABLE IF NOT EXISTS "control"."request_errors" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"request_id" varchar(9) NOT NULL,
	"method" varchar(10) NOT NULL,
	"route" varchar(200),
	"status" smallint NOT NULL,
	"kind" varchar(120) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "request_errors_status_check" CHECK ("control"."request_errors"."status" in (500, 503)),
	CONSTRAINT "request_errors_request_id_check" CHECK ("control"."request_errors"."request_id" ~ '^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$')
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "control"."request_errors" ADD CONSTRAINT "request_errors_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "control"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "request_errors_tenant_idx" ON "control"."request_errors" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "request_errors_created_idx" ON "control"."request_errors" USING btree ("created_at");
--> statement-breakpoint
-- API-27, D8-3 (Phase 8 Slice 8.1): the app writes a shop's server fault, reads it for the operator's shop page and
-- clears it after 7 days; it never changes one.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT, DELETE ON control.request_errors TO lytronix_app;
    GRANT USAGE, SELECT ON SEQUENCE control.request_errors_id_seq TO lytronix_app;
  END IF;
END $$;
