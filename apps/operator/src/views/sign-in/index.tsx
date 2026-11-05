import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  useOperatorEnroll,
  useOperatorSignIn,
  useOperatorVerify,
  type Credentials,
} from '@/api/operator-auth';
import { AuthFrame } from '@/components/layout/auth-frame';
import { BackupCodesStep } from './backup-codes-step';
import { CredentialsStep } from './credentials-step';
import { EnrollStep } from './enroll-step';
import { isLockedOut, useLockout } from './lockout';
import { VerifyStep } from './verify-step';

type Step =
  | { kind: 'credentials' }
  | { kind: 'enroll'; secret: string; uri: string }
  | { kind: 'backup-codes'; codes: string[] }
  | { kind: 'verify' };

/**
 * One container for the whole flow (ADM-01), not three routed screens: every step re-asserts email and
 * password (there is no "pending enrolment" session), so they live only in this component's state and
 * never in a URL. A lock at any step returns to the first, where it shows.
 */
export function SignIn(): React.JSX.Element {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>({ kind: 'credentials' });
  const [credentials, setCredentials] = useState<Credentials>({ email: '', password: '' });
  const signIn = useOperatorSignIn();
  const enroll = useOperatorEnroll();
  const verify = useOperatorVerify();
  const lockout = useLockout();

  function enterConsole(): void {
    void navigate({ to: '/' });
  }

  function onRefused(error: unknown): void {
    if (!isLockedOut(error)) return;
    lockout.start(error);
    setStep({ kind: 'credentials' });
  }

  return (
    <AuthFrame>
      {step.kind === 'credentials' ? (
        <CredentialsStep
          initialEmail={credentials.email}
          locked={lockout.locked}
          pending={signIn.isPending}
          error={signIn.error}
          onEmailEdit={lockout.clear}
          onSubmit={(submitted) => {
            signIn.mutate(submitted, {
              onError: onRefused,
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
          email={credentials.email}
          secret={step.secret}
          uri={step.uri}
          pending={enroll.isPending}
          error={enroll.error}
          onSubmit={(code) => {
            enroll.mutate(
              { ...credentials, code },
              {
                onError: onRefused,
                onSuccess: (data) => {
                  setStep({ kind: 'backup-codes', codes: data.backupCodes });
                },
              },
            );
          }}
        />
      ) : null}

      {step.kind === 'backup-codes' ? (
        <BackupCodesStep email={credentials.email} codes={step.codes} onContinue={enterConsole} />
      ) : null}

      {step.kind === 'verify' ? (
        <VerifyStep
          email={credentials.email}
          pending={verify.isPending}
          error={verify.error}
          onSubmit={(code) => {
            verify.mutate(
              { ...credentials, code },
              { onError: onRefused, onSuccess: enterConsole },
            );
          }}
          onBack={() => {
            verify.reset();
            signIn.reset();
            setStep({ kind: 'credentials' });
          }}
        />
      ) : null}
    </AuthFrame>
  );
}
