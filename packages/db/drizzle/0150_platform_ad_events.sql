-- MKT-04 (the owner, 2026-11-24): Lytro's own once-per-shop ad events for Meta -- a shop's activation and its first
-- paid plan -- one row each the first time it is queued, so a shop is told of once. Kind: add -- one new table, no
-- data moved. The previous release neither reads nor writes it.
CREATE TABLE "control"."platform_ad_events" (
	"tenant_id" uuid NOT NULL,
	"event_name" text NOT NULL,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_ad_events_pkey" PRIMARY KEY("tenant_id","event_name")
);
--> statement-breakpoint
ALTER TABLE "control"."platform_ad_events" ADD CONSTRAINT "platform_ad_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "control"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- The first insert for a shop and event wins (ON CONFLICT DO NOTHING); a row is never changed.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT ON control.platform_ad_events TO lytronix_app;
  END IF;
END $$;
