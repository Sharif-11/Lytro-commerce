import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
  operatorEnrollSchema,
  operatorRegenerateBackupCodesSchema,
  operatorSigninSchema,
  operatorVerifySchema,
} from '@lytronix/validators';
import { operatorSession } from '@/session/operator-session';
import type { OperatorEnrolled, OperatorSigninResult, OperatorVerified } from '@/types/operator';

export interface Credentials {
  email: string;
  password: string;
}

/** ADM-01 step 1: email and password; the answer says whether two-factor must be enrolled or verified. */
export function useOperatorSignIn() {
  return useMutation({
    mutationFn: (credentials: Credentials) =>
      operatorSession.client.post<OperatorSigninResult>(
        '/auth/operator/signin',
        operatorSigninSchema.parse(credentials),
      ),
  });
}

/** First sign-in: confirms the authenticator with one code and returns the backup codes, once. */
export function useOperatorEnroll() {
  return useMutation({
    mutationFn: (input: Credentials & { code: string }) =>
      operatorSession.client.post<OperatorEnrolled>(
        '/auth/operator/enroll',
        operatorEnrollSchema.parse(input),
      ),
    onSuccess: (data) => {
      operatorSession.setSignedIn(data.csrfToken);
    },
  });
}

/** Every later sign-in: a TOTP code or a backup code in the same field. */
export function useOperatorVerify() {
  return useMutation({
    mutationFn: (input: Credentials & { code: string }) =>
      operatorSession.client.post<OperatorVerified>(
        '/auth/operator/verify',
        operatorVerifySchema.parse(input),
      ),
    onSuccess: (data) => {
      operatorSession.setSignedIn(data.csrfToken);
    },
  });
}

/** Re-asserts the password and a fresh code, then replaces every backup code. */
export function useRegenerateBackupCodes() {
  return useMutation({
    mutationFn: (input: Credentials & { code: string }) =>
      operatorSession.client.post<{ backupCodes: string[] }>(
        '/auth/operator/backup-codes/regenerate',
        operatorRegenerateBackupCodesSchema.parse(input),
      ),
  });
}

/** Ends the session and returns to sign-in either way: a failed call must not trap the operator. */
export function useOperatorSignOut() {
  const navigate = useNavigate();
  return useMutation({
    mutationFn: () => operatorSession.client.post<{ ok: true }>('/auth/operator/signout'),
    onSettled: () => {
      operatorSession.clear();
      void navigate({ to: '/sign-in' });
    },
  });
}
