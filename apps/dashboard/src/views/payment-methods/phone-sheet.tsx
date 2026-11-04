import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ApiClientError } from '@lytronix/api-client';
import { IdentityKind } from '@lytronix/validators';
import { useRequestIdentityCode, useVerifyIdentity } from '@/api/identities';
import { PAYMENT_METHODS_QUERY_KEY } from '@/api/payment-methods';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { CodeBoxes } from '@/components/ui/code-boxes';
import { Field } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { useCountdown } from '@/hooks/use-countdown';
import { useErrorText } from '@/hooks/use-error-text';
import { bangladeshiPhone } from '@/lib/phone';

/**
 * The owner's phone, from the banner on Payment methods (TVR-01; the prototype's `sh-pm33-phone`, `sh-pm33-code`,
 * `sh-pm33-taken`): the number, its code, and a number on another account refused, offering another. The code is
 * Lytro's cost. Resend once its wait is over, as Add an email has, since a lost text would otherwise end the step.
 */
export function PhoneSheet({ onClose }: { onClose: () => void }): React.JSX.Element {
  const { t } = useTranslation('menu');
  const { t: words } = useTranslation('onboarding');
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const request = useRequestIdentityCode();
  const verify = useVerifyIdentity();
  const [localPhone, setLocalPhone] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ phone: string; minutes: number; resend: number } | null>(null);
  const [code, setCode] = useState('');
  const [taken, setTaken] = useState(false);
  const resendIn = useCountdown(sent?.resend ?? 0);

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

  const submitPhone = (): void => {
    const phone = bangladeshiPhone.fromLocalPart(localPhone);
    if (!bangladeshiPhone.isValid(phone)) {
      setPhoneError(words('invalidPhone'));
      return;
    }
    setPhoneError(null);
    send(phone);
  };

  const startAgain = (): void => {
    setTaken(false);
    setSent(null);
    setLocalPhone('');
    setCode('');
    request.reset();
    verify.reset();
  };

  if (taken) {
    return (
      <Sheet
        open
        title={t('pmPhoneTitle')}
        onClose={onClose}
        footer={
          <Button wide onClick={startAgain}>
            {words('obPhoneOther')}
          </Button>
        }
      >
        <Field
          label={words('phoneLabel')}
          prefix="+880"
          value={sent ? bangladeshiPhone.localPart(sent.phone) : localPhone}
          readOnly
          error={words('obPhoneTaken')}
        />
      </Sheet>
    );
  }

  if (sent) {
    const wrong =
      verify.error && !(verify.error instanceof ApiClientError && verify.error.status === 409)
        ? errorText(verify.error)
        : null;
    return (
      <Sheet
        open
        title={words('vTitle')}
        onClose={onClose}
        footer={
          <div className="flex w-full flex-col items-center gap-2.5">
            <Button
              wide
              disabled={code.length < 6}
              busy={verify.isPending}
              onClick={() => {
                verify.mutate(
                  { kind: IdentityKind.Phone, value: sent.phone, code },
                  {
                    onSuccess: () => {
                      void queryClient.invalidateQueries({ queryKey: PAYMENT_METHODS_QUERY_KEY });
                      onClose();
                    },
                    onError: (error) => {
                      if (error instanceof ApiClientError && error.status === 409) setTaken(true);
                    },
                  },
                );
              }}
            >
              {words('vSubmit')}
            </Button>
            {resendIn > 0 ? (
              <p className="num text-center text-[14px] text-fg-muted">
                {words('vResendIn', { s: resendIn })}
              </p>
            ) : (
              <Button
                tone="ghost"
                size="sm"
                busy={request.isPending}
                onClick={() => {
                  send(sent.phone);
                }}
              >
                {words('vResend')}
              </Button>
            )}
          </div>
        }
      >
        <p className="text-[14px] text-fg-muted">
          {words('vLead', { phone: bangladeshiPhone.international(sent.phone) })}
        </p>
        <CodeBoxes label={words('vTitle')} value={code} onChange={setCode} error={wrong} />
        {wrong ? null : (
          <p className="text-[14px] text-fg-muted">{words('vValid', { minutes: sent.minutes })}</p>
        )}
        {request.isError ? <Banner tone="bad">{errorText(request.error)}</Banner> : null}
      </Sheet>
    );
  }

  return (
    <Sheet
      open
      title={t('pmPhoneTitle')}
      onClose={onClose}
      footer={
        <Button wide busy={request.isPending} onClick={submitPhone}>
          {t('pmPhoneSend')}
        </Button>
      }
    >
      <p className="text-[14px] text-fg-muted">{t('pmPhoneLead')}</p>
      <Field
        label={words('phoneLabel')}
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
      {request.isError ? <Banner tone="bad">{errorText(request.error)}</Banner> : null}
    </Sheet>
  );
}
