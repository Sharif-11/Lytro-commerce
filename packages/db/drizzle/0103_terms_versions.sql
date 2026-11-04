ALTER TABLE "control"."subscribers" ADD COLUMN "terms_version" text;--> statement-breakpoint
ALTER TABLE "control"."subscribers" ADD COLUMN "privacy_version" text;--> statement-breakpoint
ALTER TABLE "control"."subscribers" ADD COLUMN "terms_accepted_at" timestamp with time zone;--> statement-breakpoint
-- LEG-01 (editable): the versions a new account accepts, named by the day; each changes when its new text is published.
INSERT INTO control.platform_settings (key, value, description) VALUES
  ('terms_version', '"2026-11-04"', 'The terms of service in force, which a new account accepts: change it when new terms are published (LEG-01).'),
  ('privacy_version', '"2026-11-04"', 'The privacy policy in force, which a new account accepts: change it when a new policy is published (LEG-01).')
ON CONFLICT (key) DO NOTHING;
