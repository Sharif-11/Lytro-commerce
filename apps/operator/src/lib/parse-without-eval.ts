import { z } from 'zod';

// Slice 11.13a's Content-Security-Policy has no 'unsafe-eval'. Zod 4 speeds up an object with `new Function`, and
// asks the browser whether that is allowed as each z.object() is made: a refusal the policy reports on every page
// (the Zod 4 upgrade, 2026-11-17). Set before any schema exists -- main.tsx's first import, before any module that
// imports @lytronix/validators -- Zod never asks. As in the dashboard (apps/dashboard); the server has no such policy.
z.config({ jitless: true });
