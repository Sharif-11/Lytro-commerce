import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { CourierConnectionState, CourierKey, CourierMessagesState } from '@lytronix/validators';
import {
  useCourierAdapters,
  useCourierAddress,
  useCourierConnections,
  useSetDefaultCourier,
} from '@/api/couriers';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { buttonClass } from '@/components/ui/classes';
import { rowClass, RowChevron, RowList } from '@/components/ui/list-row';
import { SkeletonRows } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useErrorText } from '@/hooks/use-error-text';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';
import { ConnectionName, ConnectionState, CourierLead, RetiringBanner } from './index';
import {
  ConnectSheet,
  DisconnectDialog,
  NewAddressDialog,
  PasteSheet,
  StoreSheet,
  type ConnectMode,
} from './sheets';

type Open =
  | { kind: 'keys'; mode: ConnectMode }
  | { kind: 'paste' }
  | { kind: 'newPair' }
  | { kind: 'store' }
  | { kind: 'disconnect' };

/** One of a connection's rows (the prototype's 56 px `.row` with a 15 px title): what it is, and what it says. */
function SettingRow({
  title,
  sub,
  onClick,
  trail,
}: {
  title: string;
  sub: string;
  onClick: () => void;
  trail?: React.ReactNode;
}): React.JSX.Element {
  return (
    <button type="button" onClick={onClick} className={`${rowClass} min-h-14`}>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px] font-medium">{title}</span>
        <span className="text-[14px] text-fg-muted">{sub}</span>
      </span>
      {trail ?? <RowChevron />}
    </button>
  );
}

/**
 * One connection (Part 36's `c36-steadfast`, `c36-pathao`, `c36-redx`; CRR-02 to CRR-05, CRR-20): its message state with what
 * to do while none have come; Default as a switch; the pickup store where the courier has stores; the paste steps again, with
 * Get a new address; Replace keys, a blank field keeping what is saved; Pathao's Log in again; Disconnect.
 */
export function CourierView({ courierKey }: { courierKey: string }): React.JSX.Element {
  const { t } = useTranslation('menu');
  const errorText = useErrorText();
  const navigate = useNavigate();
  const { slug } = useShell();
  const connections = useCourierConnections();
  const adapters = useCourierAdapters();
  const setDefault = useSetDefaultCourier();
  const [open, setOpen] = useState<Open | null>(null);
  const parsed = z.nativeEnum(CourierKey).safeParse(courierKey);
  const known = parsed.success ? parsed.data : null;
  const connection = connections.data?.find((each) => each.courierKey === known);
  const adapter = adapters.data?.find((each) => each.key === known);
  const address = useCourierAddress(known ?? CourierKey.Steadfast, {
    enabled: known !== null && open?.kind === 'paste',
  });
  const close = (): void => {
    setOpen(null);
  };
  // A courier this shop isn't connected to (disconnected, or never): its list, where it can be connected.
  const missing = connections.isSuccess && adapters.isSuccess && (!connection || !adapter);
  useEffect(() => {
    if (missing) {
      void navigate({ to: '/$shop/settings/couriers', params: { shop: slug }, replace: true });
    }
  }, [missing, navigate, slug]);

  if (!connection || !adapter) {
    const failure = connections.error ?? adapters.error;
    return (
      <ShellPage>
        {failure ? (
          <Banner tone="bad">{errorText(failure)}</Banner>
        ) : (
          <Card flush>
            <SkeletonRows count={3} />
          </Card>
        )}
      </ShellPage>
    );
  }

  const key = connection.courierKey;
  const loginEnded = connection.state === CourierConnectionState.LoginRefused;
  return (
    <ShellPage title={connection.name} titleInHeader>
      <div className="flex max-w-[640px] flex-col gap-3.5">
        {connection.retiring ? (
          <RetiringBanner retiring={connection} connections={connections.data ?? []} standalone />
        ) : null}
        {setDefault.isError ? <Banner tone="bad">{errorText(setDefault.error)}</Banner> : null}
        <Card flush>
          <div className={`${rowClass} min-h-16`}>
            <CourierLead />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <ConnectionName connection={connection} />
              {loginEnded ? null : <ConnectionState connection={connection} />}
            </span>
          </div>
          {!loginEnded && connection.messages === CourierMessagesState.NoneYet ? (
            <div className="px-4 pb-3">
              <Banner tone="neutral">{t('crMsgNoneD')}</Banner>
            </div>
          ) : null}
          {loginEnded ? (
            <div className="px-4 pb-3">
              <Banner
                tone="bad"
                action={
                  <button
                    type="button"
                    className="text-primary"
                    onClick={() => {
                      setOpen({ kind: 'keys', mode: 'login' });
                    }}
                  >
                    {t('crLogInAgain')}
                  </button>
                }
              >
                {t('crLoginEnded')}
              </Banner>
            </div>
          ) : null}
          <RowList className="border-t border-line">
            <div className={`${rowClass} min-h-14`}>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[15px] font-medium">{t('crDefault')}</span>
                <span className="text-[14px] text-fg-muted">{t('crDefaultD')}</span>
              </span>
              <Switch
                checked={connection.isDefault}
                label={t('crDefault')}
                disabled={setDefault.isPending}
                onChange={(on) => {
                  // A shop always has one default: another courier's switch moves it, so this one can't be turned off.
                  if (on) setDefault.mutate(key);
                }}
              />
            </div>
            {adapter.hasStores ? (
              <SettingRow
                title={t('crStore')}
                sub={
                  connection.pickupStore?.name ??
                  (key === CourierKey.RedX ? t('crStoreNoneRedx') : t('crStoreNone'))
                }
                onClick={() => {
                  setOpen({ kind: 'store' });
                }}
              />
            ) : null}
            <SettingRow
              title={t('crPaste')}
              sub={t('crShowAddr')}
              onClick={() => {
                setOpen({ kind: 'paste' });
              }}
            />
            <SettingRow
              title={t('crKeys')}
              sub={t('crKeysSaved')}
              onClick={() => {
                setOpen({ kind: 'keys', mode: 'replace' });
              }}
              trail={<span className={buttonClass('outline', 'xs')}>{t('crReplace')}</span>}
            />
          </RowList>
        </Card>
        <div>
          <Button
            tone="ghost"
            className="!text-danger-text"
            onClick={() => {
              setOpen({ kind: 'disconnect' });
            }}
          >
            {t('crDisconnect')}
          </Button>
        </div>
      </div>
      {open?.kind === 'keys' ? (
        <ConnectSheet adapter={adapter} mode={open.mode} onClose={close} onConnected={close} />
      ) : null}
      {open?.kind === 'paste' ? (
        <PasteSheet
          courier={key}
          name={connection.name}
          address={address.data}
          again
          onClose={close}
          onNewPair={() => {
            setOpen({ kind: 'newPair' });
          }}
        />
      ) : null}
      {open?.kind === 'newPair' ? (
        <NewAddressDialog
          courier={key}
          onClose={close}
          onMade={() => {
            setOpen({ kind: 'paste' });
          }}
        />
      ) : null}
      {open?.kind === 'store' ? (
        <StoreSheet courier={key} name={connection.name} onClose={close} />
      ) : null}
      {open?.kind === 'disconnect' ? (
        <DisconnectDialog
          courier={key}
          name={connection.name}
          retiring={connection.retiring}
          onClose={close}
          onDone={() => {
            void navigate({ to: '/$shop/settings/couriers', params: { shop: slug } });
          }}
        />
      ) : null}
    </ShellPage>
  );
}
