import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ApiClientError } from '@lytronix/api-client';
import { IdentityKind, OauthProvider } from '@lytronix/validators';
import { useOauthProviders } from '@/api/auth';
import { useAttachOauth, useIdentities, useRemoveIdentity } from '@/api/identities';
import { FacebookIcon, GoogleIcon } from '@/components/brand/oauth-icons';
import { Icon } from '@/components/icon';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { RowList } from '@/components/ui/list-row';
import { Toast } from '@/components/ui/toast';
import { useErrorText } from '@/hooks/use-error-text';
import { useToast } from '@/hooks/use-toast';
import { bangladeshiPhone } from '@/lib/phone';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';
import type { Identity } from '@/types/identity';
import { IdentityRow, LanguageCard, MarkTile } from './account-parts';
import { AddEmailSheet, ChangePasswordSheet } from './account-sheets';

/** The name a way to sign in goes by in the dialogs and toasts. */
function providerName(kind: IdentityKind, t: (key: string) => string): string {
  switch (kind) {
    case IdentityKind.Google:
      return t('idGoogle');
    case IdentityKind.Facebook:
      return t('idFacebook');
    case IdentityKind.Email:
      return t('idEmailL');
    default:
      return t('phoneId');
  }
}

/**
 * Account (TENANT-DASHBOARD-DESIGN §7.17): for the person's own sign-in, their ways to sign in with each one's action,
 * the password, language and Sign out (the prototype's `account` and its sheets); for a sign-in made on the staff page,
 * only the phone and its password (Part 11's `account-staff`, TEN-31), since such a sign-in never changes the person's
 * own account. `connected` is a provider just connected, back from its callback (AUTH-27).
 */
export function AccountView({ connected }: { connected: IdentityKind | null }): React.JSX.Element {
  const { signIn } = useShell();
  return signIn === 'staff' ? <StaffAccount /> : <OwnAccount connected={connected} />;
}

function OwnAccount({ connected }: { connected: IdentityKind | null }): React.JSX.Element {
  const { t } = useTranslation('menu');
  const errorText = useErrorText();
  const navigate = useNavigate();
  const { slug } = useShell();
  const identities = useIdentities();
  const providers = useOauthProviders();
  const attach = useAttachOauth(slug);
  const remove = useRemoveIdentity();
  const toast = useToast();
  const [changing, setChanging] = useState(false);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Identity | null>(null);
  const [onlyWay, setOnlyWay] = useState(false);

  // AUTH-27: back from a provider's callback, say it is connected, once.
  useEffect(() => {
    if (connected === null) return;
    toast.show(t('idConnected', { provider: providerName(connected, t) }));
    void navigate({ to: '/$shop/account', params: { shop: slug }, search: {}, replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  const list = identities.data?.identities ?? [];
  const of = (kind: IdentityKind) => list.filter((each) => each.kind === kind);
  const offered = providers.data?.providers ?? [];

  function askRemove(identity: Identity): void {
    if (list.length <= 1) setOnlyWay(true);
    else setRemoving(identity);
  }

  const removeButton = (identity: Identity) => (
    <Button
      tone="ghost"
      size="xs"
      onClick={() => {
        askRemove(identity);
      }}
    >
      {t('remove')}
    </Button>
  );

  const providerRow = (kind: IdentityKind, provider: OauthProvider, mark: React.ReactNode) => {
    const held = of(kind)[0];
    if (!held && !offered.includes(provider)) return null;
    return (
      <IdentityRow
        key={kind}
        mark={<MarkTile tone="plain">{mark}</MarkTile>}
        title={providerName(kind, t)}
        value={held ? held.value : t('idNotConnected')}
        action={
          held ? (
            removeButton(held)
          ) : (
            <Button
              tone="outline"
              size="xs"
              busy={attach.isPending && attach.variables === provider}
              onClick={() => {
                attach.mutate(provider);
              }}
            >
              {t('connect')}
            </Button>
          )
        }
      />
    );
  };

  const email = of(IdentityKind.Email)[0];
  return (
    <ShellPage>
      {identities.isError ? <Banner tone="bad">{errorText(identities.error)}</Banner> : null}
      {attach.isError ? <Banner tone="bad">{errorText(attach.error)}</Banner> : null}
      <Card flush>
        <div className="px-4 pt-4 pb-1">
          <h3 className="mb-1 text-[17px] font-semibold">{t('identities')}</h3>
        </div>
        <RowList>
          {of(IdentityKind.Phone).map((phone) => (
            <IdentityRow
              key={phone.id}
              mark={
                <MarkTile tone="info">
                  <Icon name="phone" />
                </MarkTile>
              }
              title={t('phoneId')}
              value={bangladeshiPhone.international(phone.value)}
              numeric
              action={
                <Button
                  tone="outline"
                  size="xs"
                  onClick={() => {
                    setChanging(true);
                  }}
                >
                  {t('changePw')}
                </Button>
              }
            />
          ))}
          {providerRow(IdentityKind.Google, OauthProvider.Google, <GoogleIcon />)}
          {providerRow(IdentityKind.Facebook, OauthProvider.Facebook, <FacebookIcon />)}
          <IdentityRow
            mark={
              <MarkTile tone="neutral">
                <Icon name="sms" />
              </MarkTile>
            }
            title={t('idEmailL')}
            value={email ? email.value : t('idNone')}
            action={
              email ? (
                removeButton(email)
              ) : (
                <Button
                  tone="outline"
                  size="xs"
                  onClick={() => {
                    setAdding(true);
                  }}
                >
                  {t('addEmail')}
                </Button>
              )
            }
          />
        </RowList>
        <p className="px-4 pt-2 pb-4 text-[14px] text-fg-muted">{t('recoveryNote')}</p>
      </Card>
      <LanguageCard />

      <ChangePasswordSheet
        open={changing}
        staff={false}
        onClose={() => {
          setChanging(false);
        }}
        onChanged={() => {
          setChanging(false);
          toast.show(t('pwChanged'));
        }}
      />
      <AddEmailSheet
        open={adding}
        onClose={() => {
          setAdding(false);
        }}
        onAdded={(address) => {
          setAdding(false);
          toast.show(t('idEmailAdded', { email: address }));
        }}
      />
      <Dialog
        open={removing !== null}
        title={t('idRemoveTitle', { provider: removing ? providerName(removing.kind, t) : '' })}
        onClose={() => {
          setRemoving(null);
          remove.reset();
        }}
        actions={
          <>
            <Button
              tone="outline"
              onClick={() => {
                setRemoving(null);
              }}
            >
              {t('keep')}
            </Button>
            <Button
              tone="danger"
              busy={remove.isPending}
              onClick={() => {
                if (!removing) return;
                const name = providerName(removing.kind, t);
                remove.mutate(removing.id, {
                  onSuccess: () => {
                    setRemoving(null);
                    toast.show(t('idRemoved', { provider: name }));
                  },
                  onError: (error) => {
                    // The server's own word that it is the only way in, raced or not.
                    if (error instanceof ApiClientError && error.code === 'conflict') {
                      setRemoving(null);
                      setOnlyWay(true);
                    }
                  },
                });
              }}
            >
              {t('idRemoveBtn')}
            </Button>
          </>
        }
      >
        {t('idRemoveCons', { provider: removing ? providerName(removing.kind, t) : '' })}
        {remove.isError &&
        !(remove.error instanceof ApiClientError && remove.error.code === 'conflict') ? (
          <span className="mt-2 block text-danger">{errorText(remove.error)}</span>
        ) : null}
      </Dialog>
      <Dialog
        open={onlyWay}
        title={t('idLastTitle')}
        onClose={() => {
          setOnlyWay(false);
        }}
        actions={
          <Button
            onClick={() => {
              setOnlyWay(false);
              setAdding(true);
            }}
          >
            {t('idAddFirst')}
          </Button>
        }
      >
        {t('idLastCons')}
      </Dialog>
      <Toast message={toast.message} />
    </ShellPage>
  );
}

/**
 * Account for a sign-in made on the staff page (TEN-31, AUTH-31; Part 11's `account-staff`): the phone the shop added
 * and its password, never the person's own sign-in methods, and how to reach those: sign in with their own phone.
 */
function StaffAccount(): React.JSX.Element {
  const { t } = useTranslation('menu');
  const { tenant, staffPhone } = useShell();
  const toast = useToast();
  const [changing, setChanging] = useState(false);
  return (
    <ShellPage>
      <Card flush>
        <div className="px-4 pt-4 pb-1">
          <h3 className="mb-1 text-[17px] font-semibold">
            {t('acStaffTitle', { shop: tenant.shopName })}
          </h3>
        </div>
        <RowList>
          <IdentityRow
            mark={
              <MarkTile tone="info">
                <Icon name="phone" />
              </MarkTile>
            }
            title={t('phoneId')}
            value={staffPhone ? bangladeshiPhone.international(staffPhone) : ''}
            numeric
            action={
              <Button
                tone="outline"
                size="xs"
                onClick={() => {
                  setChanging(true);
                }}
              >
                {t('changePw')}
              </Button>
            }
          />
        </RowList>
        <p className="px-4 pt-2 pb-4 text-[14px] text-fg-muted">{t('acStaffNote')}</p>
      </Card>
      <LanguageCard />
      <ChangePasswordSheet
        open={changing}
        staff
        onClose={() => {
          setChanging(false);
        }}
        onChanged={() => {
          setChanging(false);
          toast.show(t('pwChanged'));
        }}
      />
      <Toast message={toast.message} />
    </ShellPage>
  );
}
