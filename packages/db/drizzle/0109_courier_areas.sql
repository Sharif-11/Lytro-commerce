CREATE TABLE IF NOT EXISTS "control"."courier_areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"courier_key" text NOT NULL,
	"area_code" text NOT NULL,
	"name" text NOT NULL,
	"district_name" text NOT NULL,
	"post_code" text,
	"zilla_id" smallint,
	"thana_id" integer,
	"suggested_thana_id" integer,
	"match" text NOT NULL,
	"retired_at" timestamp with time zone,
	"refreshed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "courier_areas_code" UNIQUE("courier_key","area_code")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "courier_areas_thana_idx" ON "control"."courier_areas" USING btree ("courier_key","thana_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "courier_areas_zilla_idx" ON "control"."courier_areas" USING btree ("courier_key","zilla_id");
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    -- CUS-10: platform-wide reference data. The weekly refresh and the operator write it; areas are retired, never deleted.
    GRANT SELECT, INSERT, UPDATE ON control.courier_areas TO lytronix_app;
  END IF;
END $$;
