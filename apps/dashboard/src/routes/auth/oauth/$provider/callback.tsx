import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { OauthCallback } from '@/views/oauth-callback';

// Google and Facebook send the browser back here (OAUTH_CALLBACK_BASE is app.lytro.app, DEPLOYMENT.md §5);
// the view exchanges code+state with the backend and routes on `next` like any sign-in.
const searchSchema = z.object({
  code: z.string(),
  state: z.string(),
});

export const Route = createFileRoute('/auth/oauth/$provider/callback')({
  validateSearch: searchSchema,
  component: OauthCallback,
});
