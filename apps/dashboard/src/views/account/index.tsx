import { useState, type SyntheticEvent } from 'react';
import { Link } from '@tanstack/react-router';
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
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyLine, Page, PageHeader } from '@/components/ui/fields';
import { Icon } from '@/components/ui/icon';
import { OtpInput } from '@/components/ui/otp-input';
import { ErrorBanner, Notice } from '@/components/ui/notice';
import { Sheet } from '@/components/ui/sheet';
import { TextField } from '@/components/ui/text-field';
import { Toast } from '@/components/ui/toast';
import { useToast } from '@/hooks/use-toast';
import { bangladeshiPhone } from '@/lib/phone';
import type { Identity } from '@/types/identity';

type Adding = {
  kind: IdentityKind.Phone | IdentityKind.Email;
  value: string;
  sent: boolean;
} | null;

/**
 * Sign-in and security (AUTH-26/27): the ways into the account as rows with the provider's mark, each with
 * its one action; the recovery note under them; adding a phone or email by code in a sheet.
 */
export function Account(): React.JSX.Element {
  const { t } = useTranslation();
  const identities = useIdentities();
  const providers = useOauthProviders();
  const requestCode = useRequestIdentityCode();
  const verify = useVerifyIdentity();
  const attach = useAttachOauth();
  const remove = useRemoveIdentity();
  const toast = useToast();
  const [adding, setAdding] = useState<Adding>(null);
  const [code, setCode] = useState('');
  const [removing, setRemoving] = useState<Identity | null>(null);

  const list = identities.data?.identities ?? [];
  const has = (kind: IdentityKind): Identity | undefined =>
    list.find((identity) => identity.kind === kind);
  const offered = (provider: OauthProvider): boolean =>
    providers.data?.providers.includes(provider) ?? false;
  const canRemove = list.length > 1;

  function openAdd(kind: IdentityKind.Phone | IdentityKind.Email): void {
    requestCode.reset();
    verify.reset();
    setCode('');
    setAdding({ kind, value: '', sent: false });
  }

  function sendCode(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!adding) return;
    const value =
      adding.kind === IdentityKind.Phone
        ? bangladeshiPhone.fromLocalPart(adding.value)
        : adding.value.trim();
    if (adding.kind === IdentityKind.Phone && !bangladeshiPhone.isValid(value)) return;
    requestCode.mutate(
      { kind: adding.kind, value },
      {
        onSuccess: () => {
          setAdding({ ...adding, value, sent: true });
        },
      },
    );
  }

  function verifyCode(): void {
    if (!adding || code.length < 6) return;
    verify.mutate(
      { kind: adding.kind, value: adding.value, code },
      {
        onSuccess: () => {
          setAdding(null);
          toast.show(t('account.added'));
        },
      },
    );
  }

  const phone = has(IdentityKind.Phone);
  const email = has(IdentityKind.Email);
  const google = has(IdentityKind.Google);
  const facebook = has(IdentityKind.Facebook);

  return (
    <Page narrow>
      <PageHeader title={t('account.title')} lead={t('account.lead')} />
      {identities.isLoading ? <EmptyLine>{t('common.loading')}</EmptyLine> : null}
      {identities.isError ? <ErrorBanner message={errorMessage(identities.error, t)} /> : null}
      {identities.data ? (
        <div className="overflow-hidden rounded-card border border-line bg-white shadow-card">
          <IdentityRow
            mark={<Icon name="phone" size={20} />}
            title={phone ? bangladeshiPhone.display(phone.value) : t('account.noPhone')}
            sub={phone ? t('account.phoneSub') : t('account.noPhoneSub')}
            present={phone !== undefined}
            action={
              phone ? (
                <Link
                  to="/set-password"
                  search={{ required: false }}
                  className="text-[14px] font-bold text-brand-800"
                >
                  {t('account.changePassword')}
                </Link>
              ) : (
                <Button
                  type="button"
                  tone="outline"
                  fit
                  className="min-h-9! text-[14px]!"
                  onClick={() => {
                    openAdd(IdentityKind.Phone);
                  }}
                >
                  {t('account.add')}
                </Button>
              )
            }
          />
          <IdentityRow
            mark={<Icon name="mail" size={20} />}
            title={email ? email.value : t('account.noEmail')}
            sub={email ? t('account.emailSub') : t('account.noEmailSub')}
            present={email !== undefined}
            action={
              email ? (
                <RemoveButton
                  disabled={!canRemove}
                  onClick={() => {
                    setRemoving(email);
                  }}
                />
              ) : (
                <Button
                  type="button"
                  tone="outline"
                  fit
                  className="min-h-9! text-[14px]!"
                  onClick={() => {
                    openAdd(IdentityKind.Email);
                  }}
                >
                  {t('account.add')}
                </Button>
              )
            }
          />
          {google || offered(OauthProvider.Google) ? (
            <IdentityRow
              mark={<GoogleIcon />}
              title={google ? google.value : 'Google'}
              sub={google ? 'Google' : t('account.notConnected')}
              present={google !== undefined}
              action={
                google ? (
                  <RemoveButton
                    disabled={!canRemove}
                    onClick={() => {
                      setRemoving(google);
                    }}
                  />
                ) : (
                  <Button
                    type="button"
                    tone="outline"
                    fit
                    className="min-h-9! text-[14px]!"
                    loading={attach.isPending && attach.variables === OauthProvider.Google}
                    onClick={() => {
                      attach.mutate(OauthProvider.Google);
                    }}
                  >
                    {t('account.connect')}
                  </Button>
                )
              }
            />
          ) : null}
          {facebook || offered(OauthProvider.Facebook) ? (
            <IdentityRow
              mark={<FacebookIcon />}
              title={facebook ? facebook.value : 'Facebook'}
              sub={facebook ? 'Facebook' : t('account.notConnected')}
              present={facebook !== undefined}
              action={
                facebook ? (
                  <RemoveButton
                    disabled={!canRemove}
                    onClick={() => {
                      setRemoving(facebook);
                    }}
                  />
                ) : (
                  <Button
                    type="button"
                    tone="outline"
                    fit
                    className="min-h-9! text-[14px]!"
                    loading={attach.isPending && attach.variables === OauthProvider.Facebook}
                    onClick={() => {
                      attach.mutate(OauthProvider.Facebook);
                    }}
                  >
                    {t('account.connect')}
                  </Button>
                )
              }
            />
          ) : null}
        </div>
      ) : null}
      {attach.isError ? <ErrorBanner message={errorMessage(attach.error, t)} /> : null}
      <Notice tone="info">{t('account.recoveryNote')}</Notice>

      <Sheet
        open={adding !== null}
        title={adding?.kind === IdentityKind.Phone ? t('account.addPhone') : t('account.addEmail')}
        onClose={() => {
          setAdding(null);
        }}
      >
        {adding && !adding.sent ? (
          <form onSubmit={sendCode} className="space-y-4">
            {adding.kind === IdentityKind.Phone ? (
              <TextField
                label={t('team.phone')}
                name="newPhone"
                type="tel"
                inputMode="numeric"
                placeholder="1XXXXXXXXX"
                leading="+880"
                value={adding.value}
                onChange={(event) => {
                  setAdding({ ...adding, value: event.target.value.replace(/[^\d\s-]/g, '') });
                }}
              />
            ) : (
              <TextField
                label={t('account.email')}
                name="newEmail"
                type="email"
                inputMode="email"
                placeholder="you@example.com"
                required
                value={adding.value}
                onChange={(event) => {
                  setAdding({ ...adding, value: event.target.value });
                }}
              />
            )}
            {requestCode.isError ? (
              <ErrorBanner message={errorMessage(requestCode.error, t)} />
            ) : null}
            <Button type="submit" loading={requestCode.isPending}>
              {t('account.sendCode')}
            </Button>
            <p className="text-[13px] text-neutral-700">
              {adding.kind === IdentityKind.Phone
                ? t('account.codeNotePhone')
                : t('account.codeNoteEmail')}
            </p>
          </form>
        ) : null}
        {adding?.sent ? (
          <div className="space-y-4">
            <p className="text-[15px] text-neutral-700">
              {t('account.codeSentTo', {
                value:
                  adding.kind === IdentityKind.Phone
                    ? bangladeshiPhone.display(adding.value)
                    : adding.value,
              })}
            </p>
            <OtpInput value={code} onChange={setCode} />
            {verify.isError ? <ErrorBanner message={errorMessage(verify.error, t)} /> : null}
            <Button
              type="button"
              loading={verify.isPending}
              disabled={code.length < 6}
              onClick={verifyCode}
            >
              {t('account.confirmCode')}
            </Button>
          </div>
        ) : null}
      </Sheet>

      <ConfirmDialog
        open={removing !== null}
        title={t('account.removeTitle')}
        message={removing ? `${t(`account.kind.${removing.kind}`)} · ${removing.value}` : null}
        error={remove.isError ? errorMessage(remove.error, t) : null}
        confirmLabel={t('account.remove')}
        danger
        pending={remove.isPending}
        onConfirm={() => {
          if (!removing) return;
          remove.mutate(removing.id, {
            onSuccess: () => {
              setRemoving(null);
              toast.show(t('account.removed'));
            },
          });
        }}
        onCancel={() => {
          setRemoving(null);
          remove.reset();
        }}
      />
      <Toast message={toast.message} />
    </Page>
  );
}

function IdentityRow({
  mark,
  title,
  sub,
  present,
  action,
}: {
  mark: React.ReactNode;
  title: string;
  sub: string;
  present: boolean;
  action: React.ReactNode;
}): React.JSX.Element {
  return (
    <div
      className={`flex items-center gap-3 border-t border-line px-4 py-3 first:border-t-0 ${present ? '' : 'opacity-70'}`}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-neutral-100 text-neutral-700">
        {mark}
      </span>
      <div className="min-w-0 flex-1">
        <p className="num truncate text-[15px] font-bold text-ink">{title}</p>
        <p className="text-[13px] text-neutral-700">{sub}</p>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

function RemoveButton({
  disabled,
  onClick,
}: {
  disabled: boolean;
  onClick: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={disabled ? t('account.keepOne') : undefined}
      className="text-[14px] font-bold text-danger disabled:opacity-40"
    >
      {t('account.remove')}
    </button>
  );
}
