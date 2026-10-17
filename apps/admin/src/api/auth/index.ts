import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
  createShopSchema,
  forgotPasswordSchema,
  OauthProvider,
  passwordSigninSchema,
  requestSigninCodeSchema,
  setPasswordSchema,
  verifyForgotPasswordSchema,
  verifySigninCodeSchema,
} from '@lytronix/validators';
import { tenantSession } from '@/session/tenant-session';
import { navigateForNextStep } from '@/session/next-step';
import { clearPlanIntent, getPlanIntent } from '@/session/plan-intent';
import type {
  CodeIssued,
  OauthSignedIn,
  ShopCreated,
  SignedInBody,
  StaffSignedInBody,
} from '@/types/auth';

export const ME_QUERY_KEY = ['me'] as const;

/** The signed-in tenant's account summary — shared by the dashboard shell (branding, tab title) and any
    screen that shows account details, via TanStack Query's own cache (one request, however many callers). */
export function useMe() {
  return useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: () => tenantSession.refreshMe(),
  });
}

/** Ends the session and always returns to /sign-in — a failed signout call shouldn't trap the tenant on a
    screen they explicitly asked to leave, so the redirect happens either way (onSettled, not onSuccess). */
export function useSignOut() {
  const navigate = useNavigate();
  return useMutation({
    mutationFn: () => tenantSession.client.post<{ ok: true }>('/auth/signout'),
    onSettled: () => {
      tenantSession.clear();
      void navigate({ to: '/sign-in' });
    },
  });
}

// --- OAuth (AUTH-24) ---

export function useOauthProviders() {
  return useQuery({
    queryKey: ['oauth-providers'],
    queryFn: () => tenantSession.client.get<{ providers: OauthProvider[] }>('/auth/providers'),
  });
}

/** Redirects the browser away immediately on success — there's nothing for the caller to do afterwards. */
export function useStartOauth() {
  return useMutation({
    mutationFn: (provider: OauthProvider) =>
      tenantSession.client.get<{ url: string }>(`/auth/oauth/${provider}/start`),
    onSuccess: (data) => {
      window.location.href = data.url;
    },
  });
}

/** One call site (oauth-callback), which owns its own once-per-`state` guard (StrictMode double-mount, see
    that view's own note) — this hook only wraps the request itself and the fixed success behavior. */
export function useOauthCallback() {
  const navigate = useNavigate();
  return useMutation({
    mutationFn: ({ provider, code, state }: { provider: string; code: string; state: string }) =>
      tenantSession.client.get<OauthSignedIn>(
        `/auth/oauth/${provider}/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`,
      ),
    onSuccess: (data) => {
      tenantSession.setSignedIn(data.csrfToken);
      navigateForNextStep(navigate, data.next);
    },
  });
}

// --- Phone sign-in (AUTH-01 to AUTH-12) ---

/** No onSuccess baked in — sign-in and verify-code's resend button do different things with the result
    (navigate to /verify-code vs. just reset the on-screen countdown), so each caller supplies its own via
    mutate(phone, { onSuccess }). */
export function useRequestSigninCode() {
  return useMutation({
    mutationFn: (phone: string) =>
      tenantSession.client.post<CodeIssued>(
        '/auth/phone/code',
        requestSigninCodeSchema.parse({ phone }),
      ),
  });
}

export function useVerifyCode() {
  const navigate = useNavigate();
  return useMutation({
    mutationFn: ({ phone, code }: { phone: string; code: string }) =>
      tenantSession.client.post<SignedInBody>(
        '/auth/phone/verify',
        verifySigninCodeSchema.parse({ phone, code }),
      ),
    onSuccess: (data) => {
      tenantSession.setSignedIn(data.csrfToken);
      navigateForNextStep(navigate, data.next);
    },
  });
}

export function useSignInWithPassword() {
  const navigate = useNavigate();
  return useMutation({
    mutationFn: ({ phone, password }: { phone: string; password: string }) =>
      tenantSession.client.post<SignedInBody>(
        '/auth/signin',
        passwordSigninSchema.parse({ phone, password }),
      ),
    onSuccess: (data) => {
      tenantSession.setSignedIn(data.csrfToken);
      navigateForNextStep(navigate, data.next);
    },
  });
}

// --- Shop creation and password (AUTH-28) ---

export function useCreateShop() {
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (input: { ownerName: string; shopName: string; address?: string }) =>
      tenantSession.client.post<ShopCreated>('/shops', createShopSchema.parse(input)),
    onSuccess: () => {
      // D2-12: a guest who arrived with a plan already chosen skips the (optional, "or alongside") set-
      // password offer and lands straight on a pre-filled purchase screen instead — consumed once, so it
      // never resurfaces on a later, unrelated sign-in.
      const intent = getPlanIntent();
      if (intent) {
        clearPlanIntent();
        void navigate({
          to: '/dashboard/billing',
          search: { planId: intent.planId, termId: intent.termId },
        });
        return;
      }
      void navigate({ to: '/set-password', search: { required: false } });
    },
  });
}

export function useSetPassword() {
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (newPassword: string) =>
      tenantSession.client.post<{ ok: true }>(
        '/auth/password',
        setPasswordSchema.parse({ newPassword }),
      ),
    onSuccess: () => {
      void navigate({ to: '/dashboard' });
    },
  });
}

// --- Forgot password (AUTH-17 to AUTH-19) ---

/** The initial request only, from the phone-entry screen — navigates to the verify screen on success.
    AUTH-18's own 2-minute per-account dedup applies here. The verify screen's own resend button uses
    useResendPasswordReset instead, which follows AUTH-07's faster 60-second/hourly limits. */
export function useRequestPasswordReset() {
  return useMutation({
    mutationFn: (phone: string) =>
      tenantSession.client.post<CodeIssued>(
        '/auth/forgot-password',
        forgotPasswordSchema.parse({ phone }),
      ),
  });
}

/** AUTH-18: the reset-code screen's own resend button — a separate route from the initial request so it
    can follow AUTH-07's faster 60-second/hourly limits instead of the entry screen's 2-minute dedup. */
export function useResendPasswordReset() {
  return useMutation({
    mutationFn: (phone: string) =>
      tenantSession.client.post<CodeIssued>(
        '/auth/forgot-password/resend',
        forgotPasswordSchema.parse({ phone }),
      ),
  });
}

export function useVerifyForgotPassword() {
  const navigate = useNavigate();
  return useMutation({
    mutationFn: ({ phone, code }: { phone: string; code: string }) =>
      tenantSession.client.post<SignedInBody>(
        '/auth/forgot-password/verify',
        verifyForgotPasswordSchema.parse({ phone, code }),
      ),
    onSuccess: (data) => {
      tenantSession.setSignedIn(data.csrfToken);
      // Always a must_set_password session (AUTH-19) — the one destination, required, unlike the owner's
      // other sign-in paths which branch through navigateForNextStep.
      void navigate({ to: '/set-password', search: { required: true } });
    },
  });
}

// --- Staff sign-in (AUTH-12, AUTH-13, STF-05) ---

export function useStaffSignIn() {
  const navigate = useNavigate();
  return useMutation({
    mutationFn: ({ phone, password }: { phone: string; password: string }) =>
      tenantSession.client.post<StaffSignedInBody>(
        '/auth/staff/signin',
        passwordSigninSchema.parse({ phone, password }),
      ),
    onSuccess: (data) => {
      tenantSession.setSignedIn(data.csrfToken);
      // StaffSignedInBody's own narrower NextStep (never navigateForNextStep — see staff-sign-in's note).
      if (data.next === 'set-password') {
        void navigate({ to: '/staff-set-password' });
      } else {
        void navigate({ to: '/dashboard' });
      }
    },
  });
}

export function useStaffSetPassword() {
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (newPassword: string) =>
      tenantSession.client.post<{ ok: true }>(
        '/auth/staff/password',
        setPasswordSchema.parse({ newPassword }),
      ),
    onSuccess: () => {
      void navigate({ to: '/dashboard' });
    },
  });
}
