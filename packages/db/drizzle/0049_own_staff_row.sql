-- TEN-31, AUTH-31: the dashboard lives at app.lytro.app/<shop>, so it can no longer learn from the request host which
-- shop a staff member works in. A transaction that names a person (set_config('app.subscriber_id', ...)) may read
-- that person's own staff row in any shop -- STF-06 makes it at most one. Reads only, and only those rows: every
-- other row, and every write, still follows tenant_isolation.
CREATE OR REPLACE FUNCTION tenant.current_subscriber_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.subscriber_id', true), '')::uuid;
$$;
--> statement-breakpoint
CREATE POLICY own_staff_row ON "tenant"."users"
  FOR SELECT
  USING (subscriber_id = tenant.current_subscriber_id());
