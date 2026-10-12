// Fixed, out-of-the-way ports for the E2E backend/proxy pair, distinct from the normal dev ports (3000,
// 3002) so a `pnpm dev` already running on this machine never collides with a test run.
export const BACKEND_PORT = 4100;
export const PROXY_PORT = 4101;
