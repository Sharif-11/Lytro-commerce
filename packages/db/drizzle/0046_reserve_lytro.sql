-- TEN-26: the platform's own names are never a shop's address. "lytronix" was reserved from the start
-- (migration 0002); the platform is called Lytro since 2026-10-18, so that name is reserved too.
INSERT INTO control.reserved_slugs (slug, reason) VALUES ('lytro', 'platform')
ON CONFLICT (slug) DO NOTHING;
