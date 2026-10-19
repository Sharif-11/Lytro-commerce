-- TEN-26, TEN-31: the dashboard host's own pages (DASHBOARD_PATHS in @lytronix/validators) can never be a shop's
-- slug, or app.lytro.app/<slug> would open the page instead of the shop. A server test checks this list against the
-- dashboard's top-level routes.
INSERT INTO control.reserved_slugs (slug, reason) VALUES
  ('api', 'dashboard'), ('auth', 'dashboard'), ('checkout', 'dashboard'), ('create-shop', 'dashboard'),
  ('forgot-password', 'dashboard'), ('set-password', 'dashboard'), ('set-up', 'dashboard'),
  ('shops', 'dashboard'), ('sign-in', 'dashboard'), ('sign-up', 'dashboard'),
  ('staff-set-password', 'dashboard'), ('staff-sign-in', 'dashboard'), ('unavailable', 'dashboard'),
  ('verify-code', 'dashboard')
ON CONFLICT (slug) DO NOTHING;
