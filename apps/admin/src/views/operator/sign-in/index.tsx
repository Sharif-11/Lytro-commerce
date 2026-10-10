import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  operatorEnrollSchema,
  operatorSigninSchema,
  operatorVerifySchema,
} from '@lytronix/validators';
import { AuthCard } from '@/components/auth-card';
import { errorMessage } from '@/api/error-message';
import { operatorSession } from '@/session/operator-session';
import type {
  OperatorEnrolled,
  OperatorSigninResult,
  OperatorVerified,
} from '@/types/operator-auth';
import { CredentialsStep } from '@/views/operator/sign-in/credentials-step';
import { EnrollStep } from '@/views/operator/sign-in/enroll-step';
import { BackupCodesStep } from '@/views/operator/sign-in/backup-codes-step';
import { VerifyStep } from '@/views/operator/sign-in/verify-step';

type Step =
  | { kind: 'credentials' }
  | { kind: 'enroll'; secret: string; uri: string }
  | { kind: 'backup-codes'; codes: string[] }
  | { kind: 'verify' };

const STEP_COPY: Record<Step['kind'], { titleKey: string; subtitleKey: string }> = {
  credentials: { titleKey: 'operator.signIn.title', subtitleKey: 'operator.signIn.subtitle' },
  enroll: { titleKey: 'operator.enroll.title', subtitleKey: 'operator.enroll.subtitle' },
  'backup-codes': {
    titleKey: 'operator.backupCodes.title',
    subtitleKey: 'operator.backupCodes.subtitle',
  },
  verify: { titleKey: 'operator.verify.title', subtitleKey: 'operator.verify.subtitle' },
};

/**
 * One container for the whole flow (ADM-01, D8), not three routed screens — every step re-asserts email and
 * password (there is no intermediate "pending enrollment" session to protect separately, the same rule the
 * backend itself follows), so email/password live only in this component's own React state and are never
 * put in a URL or route search param.
 */
export function OperatorSignIn(): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>({ kind: 'credentials' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const signIn = useMutation({
    mutationFn: (credentials: { email: string; password: string }) =>
      operatorSession.client.post<OperatorSigninResult>(
        '/auth/operator/signin',
        operatorSigninSchema.parse(credentials),
      ),
    onSuccess: (data, credentials) => {
      setEmail(credentials.email);
      setPassword(credentials.password);
      setStep(
        data.next === 'enroll-2fa'
          ? { kind: 'enroll', secret: data.secret, uri: data.uri }
          : { kind: 'verify' },
      );
    },
  });

  const enroll = useMutation({
    mutationFn: (code: string) =>
      operatorSession.client.post<OperatorEnrolled>(
        '/auth/operator/enroll',
        operatorEnrollSchema.parse({ email, password, code }),
      ),
    onSuccess: (data) => {
      operatorSession.setSignedIn(data.csrfToken);
      setStep({ kind: 'backup-codes', codes: data.backupCodes });
    },
  });

  const verify = useMutation({
    mutationFn: (code: string) =>
      operatorSession.client.post<OperatorVerified>(
        '/auth/operator/verify',
        operatorVerifySchema.parse({ email, password, code }),
      ),
    onSuccess: (data) => {
      operatorSession.setSignedIn(data.csrfToken);
      void navigate({ to: '/operator' });
    },
  });

  const copy = STEP_COPY[step.kind];

  return (
    <AuthCard title={t(copy.titleKey)} subtitle={t(copy.subtitleKey)}>
      {step.kind === 'credentials' ? (
        <CredentialsStep
          onSubmit={(submittedEmail, submittedPassword) => {
            signIn.mutate({ email: submittedEmail, password: submittedPassword });
          }}
          pending={signIn.isPending}
          error={signIn.isError ? errorMessage(signIn.error, t) : null}
        />
      ) : null}

      {step.kind === 'enroll' ? (
        <EnrollStep
          secret={step.secret}
          uri={step.uri}
          onSubmit={(code) => {
            enroll.mutate(code);
          }}
          pending={enroll.isPending}
          error={enroll.isError ? errorMessage(enroll.error, t) : null}
        />
      ) : null}

      {step.kind === 'backup-codes' ? (
        <BackupCodesStep
          codes={step.codes}
          onContinue={() => {
            void navigate({ to: '/operator' });
          }}
        />
      ) : null}

      {step.kind === 'verify' ? (
        <VerifyStep
          onSubmit={(code) => {
            verify.mutate(code);
          }}
          pending={verify.isPending}
          error={verify.isError ? errorMessage(verify.error, t) : null}
        />
      ) : null}
    </AuthCard>
  );
}
