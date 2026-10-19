import { useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { IdentityKind, OauthProvider } from '@lytronix/validators';
import { useOauthProviders } from '@/api/auth';
import { errorMessage } from '@/api/error-message';
import {
  useAttachOauth,
  useIdentities,
  useRemoveIdentity,
  useRequestIdentityCode,
  useVerifyIdentity,
} from '@/api/identities';
import { FacebookIcon, GoogleIcon } from '@/components/brand/oauth-icons';
import { Button } from '@/components/ui/button';
import { Tag } from '@/components/ui/chip';
import { Card, Page, PageHeader, SelectField } from '@/components/ui/fields';
import { ErrorBanner, Notice } from '@/components/ui/notice';
import { OtpInput } from '@/components/ui/otp-input';
import { TextField } from '@/components/ui/text-field';
import { useCountdown } from '@/hooks/use-countdown';
import { bangladeshiPhone } from '@/lib/phone';

type AddKind = 'phone' | 'email';

/** AUTH-26: the sign-in methods on the account; add a phone or email by code, attach Google or Facebook,
    remove one that is not the last and does not own the shop. */
export function Account(): React.JSX.Element {
  const { t } = useTranslation();
  const identities = useIdentities();
  const providers = useOauthProviders();
  const requestCode = useRequestIdentityCode();
  const verify = useVerifyIdentity();
  const attach = useAttachOauth();
  const remove = useRemoveIdentity();
  const [kind, setKind] = useState<AddKind>('phone');
  const [value, setValue] = useState('');
  const [pendingValue, setPendingValue] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [resendAfter, setResendAfter] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);
  const resendIn = useCountdown(resendAfter);

  function normalised(): string {
    return kind === 'phone' ? bangladeshiPhone.fromLocalPart(value) : value.trim();
  }

  function handleRequest(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    const target = normalised();
    if (kind === 'phone' && !bangladeshiPhone.isValid(target)) {
      setFormError(t('signIn.invalidPhone'));
      return;
    }
    if (kind === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) {
      setFormError(t('account.invalidEmail'));
      return;
    }
    setFormError(null);
    requestCode.mutate(
      { kind, value: target },
      {
        onSuccess: (data) => {
          setPendingValue(target);
          setResendAfter(data.resendAfterSeconds);
          setCode('');
        },
      },
    );
  }

  function handleVerify(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!pendingValue) return;
    if (!/^\d{6}$/.test(code)) {
      setFormError(t('verify.invalidCode'));
      return;
    }
    setFormError(null);
    verify.mutate(
      { kind, value: pendingValue, code },
      {
        onSuccess: () => {
          setPendingValue(null);
          setValue('');
          setCode('');
        },
      },
    );
  }

  const kindLabel = (identityKind: IdentityKind): string => t(`account.kind.${identityKind}`);
  const icon = (provider: OauthProvider) =>
    provider === OauthProvider.Google ? <GoogleIcon /> : <FacebookIcon />;

  return (
    <Page narrow>
      <PageHeader title={t('account.title')} lead={t('account.lead')} />

      <Card>
        <h2 className="text-[16px] font-bold text-ink">{t('account.methods')}</h2>
        {identities.isError ? (
          <div className="mt-3">
            <ErrorBanner message={errorMessage(identities.error, t)} />
          </div>
        ) : null}
        {identities.data ? (
          <ul className="mt-3 divide-y divide-line">
            {identities.data.identities.map((identity) => (
              <li key={identity.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="num truncate text-[15px] font-semibold text-ink">
                    {identity.kind === IdentityKind.Phone
                      ? bangladeshiPhone.display(identity.value)
                      : identity.value}
                  </p>
                  <Tag tone="neutral">{kindLabel(identity.kind)}</Tag>
                </div>
                <button
                  type="button"
                  disabled={remove.isPending}
                  onClick={() => {
                    remove.mutate(identity.id);
                  }}
                  className="inline-flex min-h-10 items-center text-[14px] font-bold text-danger disabled:opacity-60"
                >
                  {t('account.remove')}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {remove.isError ? (
          <div className="mt-3">
            <ErrorBanner message={errorMessage(remove.error, t)} />
          </div>
        ) : null}
      </Card>

      <Card>
        <h2 className="text-[16px] font-bold text-ink">{t('account.add')}</h2>
        {pendingValue ? (
          <form onSubmit={handleVerify} className="mt-3 space-y-4">
            <p className="num text-[14px] text-neutral-700">
              {t('account.codeSentTo', { value: pendingValue })}
            </p>
            <OtpInput
              value={code}
              onChange={setCode}
              error={formError ?? undefined}
              disabled={verify.isPending}
            />
            {verify.isError ? <ErrorBanner message={errorMessage(verify.error, t)} /> : null}
            <div className="grid gap-2 sm:flex">
              <Button type="submit" loading={verify.isPending} className="sm:w-auto">
                {t('verify.submit')}
              </Button>
              <Button
                type="button"
                tone="ghost"
                className="sm:w-auto"
                disabled={resendIn > 0 || requestCode.isPending}
                onClick={() => {
                  requestCode.mutate(
                    { kind, value: pendingValue },
                    {
                      onSuccess: (data) => {
                        setResendAfter(data.resendAfterSeconds);
                      },
                    },
                  );
                }}
              >
                {resendIn > 0 ? t('verify.resendIn', { seconds: resendIn }) : t('verify.resend')}
              </Button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleRequest} className="mt-3 space-y-4">
            <SelectField
              label={t('account.kindLabel')}
              name="kind"
              value={kind}
              onChange={(event) => {
                setKind(event.target.value === 'email' ? 'email' : 'phone');
                setValue('');
              }}
            >
              <option value="phone">{t('account.kind.phone')}</option>
              <option value="email">{t('account.kind.email')}</option>
            </SelectField>
            {kind === 'phone' ? (
              <TextField
                label={t('signIn.phoneLabel')}
                name="newPhone"
                type="tel"
                inputMode="numeric"
                placeholder="1XXXXXXXXX"
                leading="+880"
                value={value}
                onChange={(event) => {
                  setValue(event.target.value.replace(/[^\d\s-]/g, ''));
                }}
                error={formError ?? undefined}
              />
            ) : (
              <TextField
                label={t('account.kind.email')}
                name="newEmail"
                type="email"
                inputMode="email"
                value={value}
                onChange={(event) => {
                  setValue(event.target.value);
                }}
                error={formError ?? undefined}
              />
            )}
            {requestCode.isError ? (
              <ErrorBanner message={errorMessage(requestCode.error, t)} />
            ) : null}
            <Button type="submit" fit loading={requestCode.isPending}>
              {t('account.sendCode')}
            </Button>
          </form>
        )}
        {providers.data && providers.data.providers.length > 0 ? (
          <div className="mt-5 space-y-2">
            <p className="text-[14px] font-bold text-ink">{t('account.attachProvider')}</p>
            {providers.data.providers.map((provider) => (
              <Button
                key={provider}
                type="button"
                tone="outline"
                loading={attach.isPending && attach.variables === provider}
                onClick={() => {
                  attach.mutate(provider);
                }}
              >
                {icon(provider)}
                {t(
                  provider === OauthProvider.Google
                    ? 'signIn.continueWithGoogle'
                    : 'signIn.continueWithFacebook',
                )}
              </Button>
            ))}
          </div>
        ) : null}
        <Notice tone="info" className="mt-5">
          {t('account.recoveryNote')}
        </Notice>
      </Card>
    </Page>
  );
}
