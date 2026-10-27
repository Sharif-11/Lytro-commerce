import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { IdentityKind } from '@lytronix/validators';
import { useChangePassword, useChangeStaffPassword } from '@/api/auth';
import { useRequestIdentityCode, useVerifyIdentity } from '@/api/identities';
import { PasswordRules } from '@/components/onboarding/password-rules';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { CodeBoxes } from '@/components/ui/code-boxes';
import { Field } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { useErrorText } from '@/hooks/use-error-text';
import { checkPassword, passesEveryRule } from '@/lib/password-rules';

/**
 * Change password (AUTH-20, the prototype's `sh-password`; for a staff sign-in Part 11's `sh-password-staff`): the
 * current one, the new one twice with its rules ticking as typed, as on the password step, and that every other
 * device signs out. Forgotten, the person's own sends a code to their phone; a staff one asks the owner (STF-13).
 */
export function ChangePasswordSheet({
  open,
  staff,
  onClose,
  onChanged,
}: {
  open: boolean;
  staff: boolean;
  onClose: () => void;
  onChanged: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('menu');
  const errorText = useErrorText();
  const own = useChangePassword();
  const asStaff = useChangeStaffPassword();
  const change = staff ? asStaff : own;
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [mismatch, setMismatch] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCurrent('');
    setPassword('');
    setAgain('');
    setMismatch(false);
    own.reset();
    asStaff.reset();
    // The mutations are stable; opening the sheet is what starts it afresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const check = checkPassword(password);
  const ready = current !== '' && passesEveryRule(check);

  function save(): void {
    if (password !== again) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    change.mutate({ currentPassword: current, newPassword: password }, { onSuccess: onChanged });
  }

  return (
    <Sheet
      open={open}
      title={t('chpwTitle')}
      onClose={onClose}
      footer={
        <Button wide disabled={!ready} busy={change.isPending} onClick={save}>
          {t('pwSaveBtn')}
        </Button>
      }
    >
      <div className="flex flex-col gap-1">
        <Field
          label={t('pwCurrent')}
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(event) => {
            setCurrent(event.target.value);
          }}
        />
        <p className="text-[14px] text-fg-muted">
          {staff ? (
            t('acStaffForgot')
          ) : (
            <Link to="/forgot-password" className="text-primary underline">
              {t('pwForgotLink')}
            </Link>
          )}
        </p>
      </div>
      <Field
        label={t('pwNew')}
        name="newPassword"
        type="password"
        autoComplete="new-password"
        placeholder={t('pwPh')}
        value={password}
        onChange={(event) => {
          setPassword(event.target.value);
        }}
      />
      <Field
        label={t('pwAgain')}
        name="passwordAgain"
        type="password"
        autoComplete="new-password"
        value={again}
        error={mismatch ? t('pwMismatch') : undefined}
        onChange={(event) => {
          setAgain(event.target.value);
        }}
      />
      <PasswordRules check={check} />
      <p className="text-[14px] text-fg-muted">{t('pwOthersOut')}</p>
      {change.isError ? <Banner tone="bad">{errorText(change.error)}</Banner> : null}
    </Sheet>
  );
}

/**
 * Add an email (AUTH-26, the prototype's `sh-identity-email` then `sh-identity-code`): the address, then the six-digit
 * code sent to it, with Resend once its wait is over.
 */
export function AddEmailSheet({
  open,
  onClose,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  onAdded: (email: string) => void;
}): React.JSX.Element {
  const { t } = useTranslation('menu');
  const errorText = useErrorText();
  const request = useRequestIdentityCode();
  const verify = useVerifyIdentity();
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (!open) return;
    setEmail('');
    setSentTo(null);
    setCode('');
    request.reset();
    verify.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => {
      setWait((left) => left - 1);
    }, 1000);
    return () => {
      clearTimeout(timer);
    };
  }, [wait]);

  function send(value: string): void {
    request.mutate(
      { kind: IdentityKind.Email, value },
      {
        onSuccess: (issued) => {
          setSentTo(value);
          setCode('');
          setWait(issued.resendAfterSeconds);
        },
      },
    );
  }

  if (sentTo !== null) {
    return (
      <Sheet
        open={open}
        title={t('idCodeTitle')}
        onClose={onClose}
        footer={
          <div className="flex w-full flex-col items-center gap-2.5">
            <Button
              wide
              disabled={code.length < 6}
              busy={verify.isPending}
              onClick={() => {
                verify.mutate(
                  { kind: IdentityKind.Email, value: sentTo, code },
                  {
                    onSuccess: () => {
                      onAdded(sentTo);
                    },
                  },
                );
              }}
            >
              {t('idVerify')}
            </Button>
            {wait > 0 ? (
              <p className="num text-center text-[14px] text-fg-muted">
                {t('idResendIn', { seconds: wait })}
              </p>
            ) : (
              <Button
                tone="ghost"
                size="sm"
                busy={request.isPending}
                onClick={() => {
                  send(sentTo);
                }}
              >
                {t('idResend')}
              </Button>
            )}
          </div>
        }
      >
        <p className="text-[14px] text-fg-muted">{t('idCodeLead', { email: sentTo })}</p>
        <CodeBoxes
          label={t('idCodeTitle')}
          value={code}
          onChange={setCode}
          error={verify.isError ? errorText(verify.error) : undefined}
        />
        <p className="text-[14px] text-fg-muted">{t('idCodeValid')}</p>
      </Sheet>
    );
  }

  return (
    <Sheet
      open={open}
      title={t('idEmailTitle')}
      onClose={onClose}
      footer={
        <Button
          wide
          disabled={email.trim() === ''}
          busy={request.isPending}
          onClick={() => {
            send(email.trim());
          }}
        >
          {t('idSendCode')}
        </Button>
      }
    >
      <p className="text-[14px] text-fg-muted">{t('idEmailLead')}</p>
      <Field
        label={t('idEmailL')}
        name="email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(event) => {
          setEmail(event.target.value);
        }}
      />
      {request.isError ? <Banner tone="bad">{errorText(request.error)}</Banner> : null}
    </Sheet>
  );
}
