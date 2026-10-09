import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { OauthCallback } from '@/views/oauth-callback';

const searchSchema = z.object({
  code: z.string(),
  state: z.string(),
});

// Matches the redirect_uri the backend builds (OauthService.redirectUri, apps/server) and the Caddy rule
// that routes it to this SPA instead of straight to the backend (docs/DEPLOYMENT.md §5) — the browser lands
// here after Google/Facebook, and this page makes the actual backend call itself via fetch.
export const Route = createFileRoute('/auth/oauth/$provider/callback')({
  validateSearch: searchSchema,
  component: OauthCallback,
});
