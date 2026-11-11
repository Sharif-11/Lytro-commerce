import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiClientError } from '@lytronix/api-client';
import { CourierKey } from '@lytronix/validators';
import {
  useConnectCourier,
  useDisconnectCourier,
  useNewCourierAddress,
  usePickupStores,
  useSetPickupStore,
} from '@/api/couriers';
import { ErrorBanner } from '@/components/error-banner';
import { Icon } from '@/components/icon';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { RadioMark } from '@/components/ui/kv';
import { RowList } from '@/components/ui/list-row';
import { Sheet } from '@/components/ui/sheet';
import { SkeletonRows } from '@/components/ui/skeleton';
import { StatusTag } from '@/components/ui/status-tag';
import { useErrorText } from '@/hooks/use-error-text';
import type { CourierAdapter, CourierConnected, MessageAddress } from '@/types/couriers';
import { FIELD_LABEL, LEAD_WORD, PASTE_STEPS, tokenLabel } from './words';

/** What connecting is for: a new connection, new keys for one, or Pathao's login again (a blank field keeps what is saved). */
export type ConnectMode = 'connect' | 'replace' | 'login';

/** Why the courier refused, from the server's answer (Part 36's `sh-c36-refused`, `sh-c36-toomany`). */
function ConnectRefusal({
  error,
  adapter,
}: {
  error: unknown;
  adapter: CourierAdapter;
}): React.JSX.Element {
  const { t } = useTranslation('menu');
  const errorText = useErrorText();
  if (error instanceof ApiClientError) {
    // Steadfast locks a key out after 10 failures in 5 minutes, which is why Lytro stops at 5 (PHASE-6-PLAN §3.6).
    if (error.code === 'rate_limited' && adapter.key === CourierKey.Steadfast) {
      return <Banner tone="warn">{t('crTooMany', { c: adapter.name })}</Banner>;
    }
    if (error.code === 'rate_limited') return <Banner tone="warn">{errorText(error)}</Banner>;
    const said = error.details.courierMessage;
    if (error.code === 'conflict' && typeof said === 'string') {
      return <Banner tone="bad">{t('crRefused', { c: adapter.name, m: said })}</Banner>;
    }
  }
  return <ErrorBanner error={error} />;
}

/**
 * Connecting a courier (Part 36's `sh-c36-connect-*`, CRR-02, CRR-03): its own fields, named as its panel names them; Test and
 * connect checks the keys once and makes no parcel. Replace keys keeps a blank field's saved value; Pathao's Log in again asks
 * its email and password, the password used once and never kept.
 */
export function ConnectSheet({
  adapter,
  mode,
  onClose,
  onConnected,
}: {
  adapter: CourierAdapter;
  mode: ConnectMode;
  onClose: () => void;
  onConnected: (connected: CourierConnected) => void;
}): React.JSX.Element {
  const { t } = useTranslation('menu');
  const connect = useConnectCourier();
  const fields =
    mode === 'login'
      ? adapter.credentialFields.filter((field) => field === 'username' || field === 'password')
      : adapter.credentialFields;
  const [values, setValues] = useState<Record<string, string>>({});
  const filled = (field: string): boolean => (values[field] ?? '').trim() !== '';
  // A new connection needs every field; new keys or a login again need what is typed, a blank one keeping what is saved.
  const ready =
    mode === 'connect'
      ? fields.every(filled)
      : mode === 'login'
        ? filled('password')
        : fields.some(filled);
  const title =
    mode === 'connect'
      ? t('crConnectT', { c: adapter.name })
      : mode === 'login'
        ? t('crLoginT')
        : t('crReplace');
  const lead =
    mode === 'connect'
      ? t(LEAD_WORD[adapter.key])
      : mode === 'login'
        ? t('crLoginD')
        : t('crReplaceD');
  return (
    <Sheet
      open
      title={title}
      onClose={onClose}
      footer={
        <Button
          wide
          busy={connect.isPending}
          disabled={!ready}
          onClick={() => {
            const credentials = Object.fromEntries(
              fields.map((field) => [field, (values[field] ?? '').trim()]),
            );
            connect.mutate({ courierKey: adapter.key, credentials }, { onSuccess: onConnected });
          }}
        >
          {mode === 'login' ? t('crLogIn') : t('crTestConnect')}
        </Button>
      }
    >
      {connect.isError ? <ConnectRefusal error={connect.error} adapter={adapter} /> : null}
      <p className="-mb-1 text-[14px] text-fg-muted">{lead}</p>
      {fields.map((field) => {
        const label = FIELD_LABEL[field];
        const secret = field !== 'username' && field !== 'clientId';
        return (
          <Field
            key={field}
            label={label ? ('brand' in label ? label.brand : t(label.word)) : field}
            // SEC-08: every key, secret and password is masked as it's typed; only the login's email and Pathao's client ID show.
            type={secret ? 'password' : field === 'username' ? 'email' : 'text'}
            autoComplete={secret ? 'new-password' : 'off'}
            spellCheck={false}
            placeholder={
              mode === 'connect'
                ? field === 'username'
                  ? 'you@example.com'
                  : undefined
                : secret || field === 'username'
                  ? '••••••••'
                  : undefined
            }
            help={field === 'password' && mode === 'connect' ? t('crPtPass') : undefined}
            value={values[field] ?? ''}
            onChange={(event) => {
              setValues({ ...values, [field]: event.target.value });
            }}
          />
        );
      })}
      {mode === 'connect' && adapter.needsArea ? (
        <Banner tone="neutral">{t('crRxArea')}</Banner>
      ) : null}
      {mode === 'login' ? null : (
        <p className="-mt-1 text-[14px] text-fg-muted">{t('crTesting')}</p>
      )}
    </Sheet>
  );
}

/** A value to paste, with Copy at its end (Part 36's `c36Copy`). */
function CopyField({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[14px] font-medium text-fg-muted">{label}</span>
      <div className="flex h-12 items-center gap-2 rounded-control border border-line-strong bg-surface px-3 text-[16px]">
        <span className="num min-w-0 flex-1 truncate">{value}</span>
        <CopyButton text={value} icon />
      </div>
    </div>
  );
}

/**
 * The paste step (Part 36's `sh-c36-paste-*`, `sh-c36-again-*`; agreed: written steps, no screenshots): the address and the token
 * with Copy, then numbered steps naming the panel's own menu words. Once connected it can be skipped, and Lytro then asks once a
 * night; shown again from the connection, it says the address is the shop's alone and offers a new one.
 */
export function PasteSheet({
  courier,
  name,
  address,
  again,
  onClose,
  onNewPair,
}: {
  courier: CourierKey;
  name: string;
  address: MessageAddress | undefined;
  again: boolean;
  onClose: () => void;
  onNewPair?: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('menu');
  const token = tokenLabel(courier);
  return (
    <Sheet
      open
      title={again ? t('crPaste') : t('crConnectedT', { c: name })}
      onClose={onClose}
      footer={
        again ? (
          <Button wide onClick={onClose}>
            {t('crDone')}
          </Button>
        ) : (
          <>
            <Button tone="outline" onClick={onClose}>
              {t('crLater')}
            </Button>
            <Button onClick={onClose}>{t('crDone')}</Button>
          </>
        )
      }
    >
      {again ? null : <p className="text-[16px]">{t('crPasteNow', { c: name })}</p>}
      {address ? (
        <>
          <CopyField label={t('crAddress')} value={address.address} />
          {token ? <CopyField label={t(token)} value={address.token} /> : null}
        </>
      ) : (
        <SkeletonRows count={2} />
      )}
      <div className="rounded-card bg-neutral-50 p-4">
        <ol className="m-0 flex list-decimal flex-col gap-2 ps-5 text-[15px]">
          {PASTE_STEPS[courier].map((step) => (
            <li key={step}>{t(step)}</li>
          ))}
        </ol>
        <p className="mt-2 text-[14px] text-fg-muted">{t('crPanelWords')}</p>
      </div>
      <p className="text-[14px] text-fg-muted">{again ? t('crAddrPrivate') : t('crOptional')}</p>
      {again && onNewPair ? (
        <div>
          <Button tone="outline" size="sm" onClick={onNewPair}>
            <Icon name="refresh" />
            {t('crNewPair')}
          </Button>
        </div>
      ) : null}
    </Sheet>
  );
}

/** Get a new address (Part 36's `dlg-c36-newpair`): the old one stops at once, and the new one must be pasted again. */
export function NewAddressDialog({
  courier,
  onClose,
  onMade,
}: {
  courier: CourierKey;
  onClose: () => void;
  onMade: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('menu');
  const replace = useNewCourierAddress(courier);
  return (
    <Dialog
      open
      title={t('crNewPair')}
      onClose={onClose}
      actions={
        <>
          <Button tone="outline" onClick={onClose}>
            {t('crKeep')}
          </Button>
          <Button
            busy={replace.isPending}
            onClick={() => {
              replace.mutate(undefined, { onSuccess: onMade });
            }}
          >
            {t('crNewPair')}
          </Button>
        </>
      }
    >
      {t('crNewPairD')}
      {replace.isError ? (
        <div className="mt-3">
          <ErrorBanner error={replace.error} />
        </div>
      ) : null}
    </Dialog>
  );
}

/**
 * Disconnect (Part 36's `dlg-c36-disconnect`, CRR-20): its keys and message address go; parcels already booked keep their record,
 * but no new news of them can arrive. A retiring courier can't be connected again once disconnected (Slice 6.6 read 8).
 */
export function DisconnectDialog({
  courier,
  name,
  retiring,
  onClose,
  onDone,
}: {
  courier: CourierKey;
  name: string;
  retiring: boolean;
  onClose: () => void;
  onDone: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('menu');
  const disconnect = useDisconnectCourier();
  return (
    <Dialog
      open
      title={t('crDiscT', { c: name })}
      onClose={onClose}
      actions={
        <>
          <Button tone="outline" onClick={onClose}>
            {t('crKeep')}
          </Button>
          <Button
            tone="danger"
            busy={disconnect.isPending}
            onClick={() => {
              disconnect.mutate(courier, { onSuccess: onDone });
            }}
          >
            {t('crDisconnect')}
          </Button>
        </>
      }
    >
      {t('crDiscD')}
      {retiring ? ` ${t('crDiscRetiring', { c: name })}` : null}
      {disconnect.isError ? (
        <div className="mt-3">
          <ErrorBanner error={disconnect.error} />
        </div>
      ) : null}
    </Dialog>
  );
}

/**
 * The pickup store (Part 36's `sh-c36-store`, Slice 6.3): every booking with this courier leaves from it, as the courier lists
 * them; an inactive one shows but can't be chosen.
 */
export function StoreSheet({
  courier,
  name,
  onClose,
}: {
  courier: CourierKey;
  name: string;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('menu');
  const stores = usePickupStores(courier);
  const save = useSetPickupStore(courier);
  const [chosen, setChosen] = useState<string | null>(null);
  const picked = chosen ?? stores.data?.chosenId ?? null;
  return (
    <Sheet
      open
      title={t('crStoreT')}
      onClose={onClose}
      footer={
        <Button
          wide
          busy={save.isPending}
          disabled={picked === null || picked === stores.data?.chosenId}
          onClick={() => {
            if (picked !== null) save.mutate(picked, { onSuccess: onClose });
          }}
        >
          {t('save')}
        </Button>
      }
    >
      <p className="text-[14px] text-fg-muted">{t('crStoreD', { c: name })}</p>
      {stores.isError ? <ErrorBanner error={stores.error} /> : null}
      {save.isError ? <ErrorBanner error={save.error} /> : null}
      {stores.isPending ? (
        <SkeletonRows count={2} />
      ) : (
        <RowList role="radiogroup" aria-label={t('crStoreT')}>
          {(stores.data?.stores ?? []).map((store) => (
            <button
              key={store.id}
              type="button"
              role="radio"
              aria-checked={picked === store.id}
              disabled={!store.active}
              onClick={() => {
                setChosen(store.id);
              }}
              className={`flex min-h-14 w-full items-center gap-3 py-2.5 text-left ${store.active ? '' : 'opacity-55'}`}
            >
              <RadioMark on={picked === store.id} />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[15px] font-medium">
                  {store.name}
                  {store.active ? null : (
                    <>
                      {' '}
                      <StatusTag tone="neutral">{t('crStoreOff')}</StatusTag>
                    </>
                  )}
                </span>
                {store.address ? (
                  <span className="text-[14px] text-fg-muted">{store.address}</span>
                ) : null}
              </span>
            </button>
          ))}
        </RowList>
      )}
    </Sheet>
  );
}
