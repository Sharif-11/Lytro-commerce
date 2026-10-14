// API-14: routes that stay outside /api/v1 -- infra health checks (load balancers, uptime monitors,
// apps/admin's e2e harness) and the test-only diagnostic route expect a fixed, unversioned path. Shared by
// main.ts's setGlobalPrefix call and the e2e test harness, so the two never drift apart.
export const UNVERSIONED_ROUTES = ['health', 'test-only/throw'];
