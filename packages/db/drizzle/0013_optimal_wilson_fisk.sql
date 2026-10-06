ALTER TABLE "control"."oauth_states" ADD COLUMN "attach_to_subscriber_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "control"."oauth_states" ADD CONSTRAINT "oauth_states_attach_to_subscriber_id_subscribers_id_fk" FOREIGN KEY ("attach_to_subscriber_id") REFERENCES "control"."subscribers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
