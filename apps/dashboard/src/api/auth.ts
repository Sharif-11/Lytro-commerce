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
import { signUpIntent } from '@/session/sign-up-intent';
import type {
  CodeIssued,
  OauthSignedIn,
  ShopCreated,
  SignedInBody,
  StaffSignedInBody,
} from '@/types/auth';

// --- OAuth (AUTH-24) ---

export function useOauthProviders() {
  return useQuery({
    queryKey: ['oauth-providers'],
    queryFn: () => tenantSession.client.get<{ providers: OauthProvider[] }>('/auth/providers'),
  });
}

/** Sends the browser to the provider; nothing to do afterwards on this page. */
export function useStartOauth() {
  return useMutation({
    mutationFn: (provider: OauthProvider) =>
      tenantSession.client.get<{ url: string }>(`/auth/oauth/${provider}/start`),
    onSuccess: (data) => {
      window.location.href = data.url;
    },
  });
}

/** The callback page owns its once-per-`state` guard; this only wraps the exchange and the fixed success
    behaviour. AUTH-27's recovery note is remembered for the password step. */
export function useOauthCallback() {
  const navigate = useNavigate();
  return useMutation({
    mutationFn: ({ provider, code, state }: { provider: string; code: string; state: string }) =>
      tenantSession.client.get<OauthSignedIn>(
        `/auth/oauth/${provider}/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`,
      ),
    onSuccess: (data) => {
      tenantSession.setSignedIn(data.csrfToken);
      if (data.recovery === 'facebook-only') {
        try {
          sessionStorage.setItem(RECOVERY_NOTE_KEY, data.recovery);
        } catch {
          // The note is a courtesy; losing it loses nothing else.
        }
      }
      navigateForNextStep(navigate, data.next);
    },
  });
}

export const RECOVERY_NOTE_KEY = 'lytro.recovery-note';

// --- Phone sign-in (AUTH-01 to AUTH-12) ---

/** No onSuccess baked in: the sign-in screen navigates to /verify-code, the resend button only resets its
    countdown, so each caller supplies its own via mutate(phone, { onSuccess }). */
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

// --- Create shop and password (AUTH-28) ---

export interface CreateShopInput {
  ownerName: string;
  shopName: string;
  address?: string;
}

/** AUTH-28 step 2 → 2b or 3: with a plan picked on the pricing page the checkout opens, otherwise the
    optional password step. The claimed address is consumed here either way. */
export function useCreateShop() {
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (input: CreateShopInput) =>
      tenantSession.client.post<ShopCreated>('/shops', createShopSchema.parse(input)),
    onSuccess: () => {
      signUpIntent.clearShop();
      const intent = signUpIntent.read();
      if (intent.planId && intent.termId) {
        void navigate({ to: '/checkout' });
        return;
      }
      void navigate({ to: '/set-password', search: { required: false } });
    },
  });
}

/** AUTH-20: `currentPassword` is never sent here; every path to this screen is a fresh sign-up or a reset. */
export function useSetPassword(onDone: () => void) {
  return useMutation({
    mutationFn: (newPassword: string) =>
      tenantSession.client.post<{ ok: true }>(
        '/auth/password',
        setPasswordSchema.parse({ newPassword }),
      ),
    onSuccess: onDone,
  });
}

// --- Forgot password (AUTH-17 to AUTH-19) ---

export function useRequestPasswordReset() {
  return useMutation({
    mutationFn: (phone: string) =>
      tenantSession.client.post<CodeIssued>(
        '/auth/forgot-password',
        forgotPasswordSchema.parse({ phone }),
      ),
  });
}

/** AUTH-18: the verify screen's own resend, on AUTH-07's faster limits. */
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
      // Always a must_set_password session (AUTH-19): the one destination, required.
      void navigate({ to: '/set-password', search: { required: true } });
    },
  });
}

// --- Staff sign-in (AUTH-31, STF-13) ---

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
      if (data.next === 'set-password') {
        void navigate({ to: '/staff-set-password' });
      } else {
        void navigate({ to: '/shops' });
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
      void navigate({ to: '/shops' });
    },
  });
}
