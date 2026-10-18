-- PYG-09, PYG-21: when a tenant entered `archived`. A pay-as-you-go shop's deletion clock (LIF-18, LIF-19) runs
-- from here, since it has no period end. Left null on rows archived earlier: the code falls back to the idle
-- clock for those, which is how they were archived.
ALTER TABLE "control"."tenants" ADD COLUMN "archived_at" timestamp with time zone;
