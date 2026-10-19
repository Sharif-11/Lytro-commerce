import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  useOperatorEnroll,
  useOperatorSignIn,
  useOperatorVerify,
  type Credentials,
} from '@/api/operator-auth';
import { errorMessage } from '@lytronix/api-client';
import { AuthFrame } from '@/components/layout/auth-frame';
import { BackupCodesStep } from './backup-codes-step';
import { CredentialsStep } from './credentials-step';
import { EnrollStep } from './enroll-step';
import { VerifyStep } from './verify-step';

type Step =
  | { kind: 'credentials' }
  | { kind: 'enroll'; secret: string; uri: string }
  | { kind: 'backup-codes'; codes: string[] }
  | { kind: 'verify' };

/**
 * One container for the whole flow (ADM-01), not three routed screens: every step re-asserts email and
 * password (there is no "pending enrolment" session), so they live only in this component's state and
 * never in a URL.
 */
export function SignIn(): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>({ kind: 'credentials' });
  const [credentials, setCredentials] = useState<Credentials>({ email: '', password: '' });
  const signIn = useOperatorSignIn();
  const enroll = useOperatorEnroll();
  const verify = useOperatorVerify();

  function enterConsole(): void {
    void navigate({ to: '/payment-queue' });
  }

  const copy = {
    credentials: { title: t('signIn.title'), lead: t('signIn.lead') },
    enroll: { title: t('enroll.title'), lead: t('enroll.lead') },
    'backup-codes': { title: t('backupCodes.title'), lead: t('backupCodes.lead') },
    verify: { title: t('verify.title'), lead: t('verify.lead') },
  }[step.kind];

  return (
    <AuthFrame title={copy.title} lead={copy.lead}>
      {step.kind === 'credentials' ? (
        <CredentialsStep
          pending={signIn.isPending}
          error={signIn.isError ? errorMessage(signIn.error, t) : null}
          onSubmit={(submitted) => {
            signIn.mutate(submitted, {
              onSuccess: (data) => {
                setCredentials(submitted);
                setStep(
                  data.next === 'enroll-2fa'
                    ? { kind: 'enroll', secret: data.secret, uri: data.uri }
                    : { kind: 'verify' },
                );
              },
            });
          }}
        />
      ) : null}

      {step.kind === 'enroll' ? (
        <EnrollStep
          secret={step.secret}
          uri={step.uri}
          pending={enroll.isPending}
          error={enroll.isError ? errorMessage(enroll.error, t) : null}
          onSubmit={(code) => {
            enroll.mutate(
              { ...credentials, code },
              {
                onSuccess: (data) => {
                  setStep({ kind: 'backup-codes', codes: data.backupCodes });
                },
              },
            );
          }}
        />
      ) : null}

      {step.kind === 'backup-codes' ? (
        <BackupCodesStep codes={step.codes} onContinue={enterConsole} />
      ) : null}

      {step.kind === 'verify' ? (
        <VerifyStep
          pending={verify.isPending}
          error={verify.isError ? errorMessage(verify.error, t) : null}
          onSubmit={(code) => {
            verify.mutate({ ...credentials, code }, { onSuccess: enterConsole });
          }}
          onBack={() => {
            verify.reset();
            setStep({ kind: 'credentials' });
          }}
        />
      ) : null}
    </AuthFrame>
  );
}
