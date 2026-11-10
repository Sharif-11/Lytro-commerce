CREATE TABLE IF NOT EXISTS "control"."media_cost_alerts" (
	"period_start" date PRIMARY KEY NOT NULL,
	"sent_to" text NOT NULL,
	"estimate" numeric(12, 2) NOT NULL,
	"budget" numeric(12, 2) NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "control"."media_cost_days" (
	"day" date NOT NULL,
	"bucket" text NOT NULL,
	"class_a" bigint DEFAULT 0 NOT NULL,
	"class_b" bigint DEFAULT 0 NOT NULL,
	"free_ops" bigint DEFAULT 0 NOT NULL,
	"peak_bytes" bigint DEFAULT 0 NOT NULL,
	"objects" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_cost_days_pkey" PRIMARY KEY("day","bucket")
);
--> statement-breakpoint
-- MED-12, D8-57, D8-63 (Phase 8 Slice 8.6): the hourly read replaces a day's rows (delete, then insert); the budget's
-- alert is written once a period and never changed.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON control.media_cost_days TO lytronix_app;
    GRANT SELECT, INSERT ON control.media_cost_alerts TO lytronix_app;
  END IF;
END $$;
