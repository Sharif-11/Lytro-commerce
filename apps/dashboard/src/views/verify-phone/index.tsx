import { useState, type SyntheticEvent } from 'react';
import { Link, Navigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ApiClientError } from '@lytronix/api-client';
import { IdentityKind } from '@lytronix/validators';
import { RECOVERY_NOTE_KEY, useVerifyCode } from '@/api/auth';
import { useIdentities, useRequestIdentityCode, useVerifyIdentity } from '@/api/identities';
import { useMe } from '@/api/me';
import { ErrorBanner } from '@/components/error-banner';
import { OnboardingFrame, Spinner, StepLinks } from '@/components/onboarding/frame';
import { IntentChips } from '@/components/onboarding/intent-chips';
import { Button } from '@/components/ui/button';
import { CodeBoxes } from '@/components/ui/code-boxes';
import { Field } from '@/components/ui/field';
import { useCountdown } from '@/hooks/use-countdown';
import { useErrorText } from '@/hooks/use-error-text';
import { bangladeshiPhone } from '@/lib/phone';
import { signUpIntent } from '@/session/sign-up-intent';

interface Sent {
  phone: string;
  minutes: number;
  resend: number;
}

/**
 * Step 1c (AUTH-28 as amended 2026-10-31, TVR-01; TENANT-DASHBOARD-DESIGN §7.35, the prototype's `ob33-phone`,
 * `ob33-code`, `ob33-taken`): someone verified by Google, Facebook or email gives a phone before Create shop, with no
 * skip. The code is Lytro's cost. A number on another account is refused only once its code is right, so it says nothing
 * of who holds a number; the same code then signs in with it, with no second text. A claimed address and a picked plan
 * stay in the sign-up intent throughout.
 */
export function VerifyPhone(): React.JSX.Element {
  const { t } = useTranslation('onboarding');
  const errorText = useErrorText();
  const me = useMe();
  const identities = useIdentities();
  const request = useRequestIdentityCode();
  const verify = useVerifyIdentity();
  const signIn = useVerifyCode();
  const [localPhone, setLocalPhone] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);
  const [code, setCode] = useState('');
  const [taken, setTaken] = useState(false);
  const resendIn = useCountdown(sent?.resend ?? 0);

  if (me.data && !me.data.needsPhone) {
    return <Navigate to={me.data.shops.length > 0 ? '/shops' : '/create-shop'} replace />;
  }

  if (me.isPending || identities.isPending) {
    return (
      <OnboardingFrame step={0} title={t('obPhoneTitle')}>
        <Spinner />
      </OnboardingFrame>
    );
  }

  const kinds = (identities.data?.identities ?? []).map((identity) => identity.kind);
  const way = kinds.includes(IdentityKind.Google)
    ? 'Google'
    : kinds.includes(IdentityKind.Facebook)
      ? 'Facebook'
      : t('obPhoneByEmail');
  const lead = t('obPhoneLead', { way });

  const send = (phone: string): void => {
    request.mutate(
      { kind: IdentityKind.Phone, value: phone },
      {
        onSuccess: (issued) => {
          setCode('');
          verify.reset();
          setSent({
            phone,
            minutes: Math.ceil(issued.expiresInSeconds / 60),
            resend: issued.resendAfterSeconds,
          });
        },
      },
    );
  };

  const startAgain = (): void => {
    setTaken(false);
    setSent(null);
    setLocalPhone('');
    setCode('');
    request.reset();
    verify.reset();
    signIn.reset();
  };

  const submitPhone = (event: SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const phone = bangladeshiPhone.fromLocalPart(localPhone);
    if (!bangladeshiPhone.isValid(phone)) {
      setPhoneError(t('invalidPhone'));
      return;
    }
    setPhoneError(null);
    send(phone);
  };

  const backToSignIn = (
    <Link to="/sign-in" search={{}}>
      {t('backSignIn')}
    </Link>
  );

  if (taken && sent) {
    return (
      <OnboardingFrame step={0} title={t('obPhoneTitle')} lead={lead}>
        <Field
          label={t('phoneLabel')}
          prefix="+880"
          value={bangladeshiPhone.localPart(sent.phone)}
          readOnly
          error={t('obPhoneTaken')}
        />
        {signIn.isError ? <ErrorBanner error={signIn.error} /> : null}
        <Button wide onClick={startAgain}>
          {t('obPhoneOther')}
        </Button>
        <Button
          tone="outline"
          wide
          busy={signIn.isPending}
          onClick={() => {
            signIn.mutate({ phone: sent.phone, code });
          }}
        >
          {t('obPhoneSignIn')}
        </Button>
        <StepLinks>{backToSignIn}</StepLinks>
      </OnboardingFrame>
    );
  }

  if (sent) {
    const refused = verify.error instanceof ApiClientError && verify.error.status === 409;
    const wrong = verify.isError && !refused ? errorText(verify.error) : null;
    return (
      <OnboardingFrame
        step={0}
        title={t('vTitle')}
        lead={t('vLead', { phone: bangladeshiPhone.international(sent.phone) })}
      >
        <form
          className="flex flex-col gap-3.5"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            verify.mutate(
              { kind: IdentityKind.Phone, value: sent.phone, code },
              {
                onSuccess: () => {
                  // AUTH-27: a Facebook account with no email has a way back in now, so the note would be untrue.
                  try {
                    sessionStorage.removeItem(RECOVERY_NOTE_KEY);
                  } catch {
                    // The note is a courtesy; losing it loses nothing else.
                  }
                },
                onError: (error) => {
                  if (error instanceof ApiClientError && error.status === 409) setTaken(true);
                },
              },
            );
          }}
        >
          <CodeBoxes
            value={code}
            onChange={setCode}
            error={wrong}
            disabled={verify.isPending}
            label={t('vTitle')}
          />
          {wrong ? null : (
            <p className="text-[14px] text-fg-muted">{t('vValid', { minutes: sent.minutes })}</p>
          )}
          <Button type="submit" wide busy={verify.isPending} disabled={code.length < 6}>
            {t('vSubmit')}
          </Button>
        </form>
        <StepLinks>
          {resendIn > 0 ? (
            <span className="num text-fg-muted">{t('vResendIn', { s: resendIn })}</span>
          ) : (
            <button
              type="button"
              disabled={request.isPending}
              onClick={() => {
                send(sent.phone);
              }}
            >
              {t('vResend')}
            </button>
          )}
          <button type="button" onClick={startAgain}>
            {t('obPhoneOther')}
          </button>
        </StepLinks>
        {request.isError ? <ErrorBanner error={request.error} /> : null}
      </OnboardingFrame>
    );
  }

  return (
    <OnboardingFrame step={0} title={t('obPhoneTitle')} lead={lead}>
      <IntentChips intent={signUpIntent.read()} />
      <form className="flex flex-col gap-3.5" onSubmit={submitPhone} noValidate>
        <Field
          label={t('phoneLabel')}
          name="phone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          prefix="+880"
          placeholder="1XXXXXXXXX"
          value={localPhone}
          error={phoneError}
          onChange={(event) => {
            setLocalPhone(event.target.value.replace(/[^\d\s-]/g, ''));
          }}
        />
        {request.isError ? <ErrorBanner error={request.error} /> : null}
        <Button type="submit" wide busy={request.isPending}>
          {t('cont')}
        </Button>
      </form>
      <StepLinks>{backToSignIn}</StepLinks>
    </OnboardingFrame>
  );
}
