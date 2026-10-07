ALTER TABLE "control"."job_outbox" ADD COLUMN "expire_in_seconds" integer;--> statement-breakpoint
ALTER TABLE "control"."job_outbox" ADD COLUMN "retry_limit" integer;--> statement-breakpoint
ALTER TABLE "control"."job_outbox" ADD COLUMN "retry_delay" integer;