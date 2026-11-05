import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '@lytronix/api-client';
import { Button, ErrorBanner } from '@lytronix/ui';
import {
  useDeletePlatformWallet,
  usePlatformWallets,
  useUpdatePlatformWallet,
} from '@/api/platform-wallets';
import { ActionPanel } from '@/components/ui/action-panel';
import { ConsoleIcon } from '@/components/ui/console-icon';
import { Consequence } from '@/components/ui/consequence';
import { ConsolePage, PageTitle } from '@/components/ui/console-page';
import { DataTable, EmptyBox, type Column } from '@/components/ui/data-table';
import { LaterCard } from '@/components/ui/later-card';
import { LoadFailed } from '@/components/ui/load-failed';
import { QUIET_BUTTON, SMALL_BUTTON } from '@/components/ui/sizes';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import type { PlatformWallet } from '@/types/operator';
import { providerColour } from './providers';
import { WalletPanel } from './wallet-panel';

type Open = { step: 'new' } | { step: 'edit' | 'remove'; wallet: PlatformWallet } | null;

function RemovePanel({
  wallet,
  onClose,
}: {
  wallet: PlatformWallet;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const remove = useDeletePlatformWallet();
  const named = `${wallet.provider} · ${wallet.number}`;
  return (
    <ActionPanel
      title={t('wallets.removeTitle')}
      sub={named}
      onClose={onClose}
      actionLabel={t('wallets.remove')}
      danger
      pending={remove.isPending}
      error={remove.isError ? errorMessage(remove.error, t) : null}
      onSubmit={() => {
        remove.mutate(wallet.id, {
          onSuccess: () => {
            toast(t('wallets.removed', { wallet: named }));
            onClose();
          },
        });
      }}
    >
      <Consequence tone="danger">{t('wallets.removeConsequence')}</Consequence>
    </ActionPanel>
  );
}

/** OPERATOR-CONSOLE-DESIGN §10: the numbers sellers send plan payments and top-ups to. */
export function Wallets(): React.JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const wallets = usePlatformWallets();
  const update = useUpdatePlatformWallet();
  const [open, setOpen] = useState<Open>(null);
  const sorted = [...(wallets.data ?? [])].sort((a, b) => a.displayOrder - b.displayOrder);
  const close = (): void => {
    setOpen(null);
  };

  const columns: Column<PlatformWallet>[] = [
    {
      key: 'provider',
      label: t('wallets.cProvider'),
      width: '150px',
      main: true,
      cell: (wallet) => (
        <span className="inline-flex items-center gap-2">
          <span
            className="size-2.5 rounded-full"
            style={{ background: providerColour(wallet.provider) }}
          />
          {wallet.provider}
        </span>
      ),
    },
    {
      key: 'number',
      label: t('wallets.cNumber'),
      width: '160px',
      cell: (wallet) => <span className="mono">{wallet.number}</span>,
    },
    {
      key: 'label',
      label: t('wallets.cLabel'),
      width: 'minmax(160px,1fr)',
      cell: (wallet) => wallet.label ?? <span className="text-fg-muted">{t('wallets.none')}</span>,
    },
    {
      key: 'shown',
      label: t('wallets.cShown'),
      width: '100px',
      cell: (wallet) => (
        <Switch
          checked={wallet.enabled}
          disabled={update.isPending}
          label={`${t('wallets.cShown')}: ${wallet.provider} ${wallet.number}`}
          onChange={(enabled) => {
            update.mutate(
              { id: wallet.id, enabled },
              {
                onSuccess: () => {
                  toast(
                    t(enabled ? 'wallets.shownOn' : 'wallets.shownOff', {
                      wallet: `${wallet.provider} ${wallet.number}`,
                    }),
                  );
                },
              },
            );
          }}
        />
      ),
    },
    {
      key: 'order',
      label: t('wallets.order'),
      width: '80px',
      right: true,
      cell: (wallet) => <span className="tabular-nums">{wallet.displayOrder}</span>,
    },
    {
      key: 'acts',
      label: '',
      width: '150px',
      actions: true,
      cell: (wallet) => (
        <>
          <Button
            type="button"
            tone="outline"
            small
            fit
            className={SMALL_BUTTON}
            onClick={() => {
              setOpen({ step: 'edit', wallet });
            }}
          >
            {t('common.edit')}
          </Button>
          <Button
            type="button"
            tone="ghost"
            small
            fit
            className={`${SMALL_BUTTON} ${QUIET_BUTTON}`}
            onClick={() => {
              setOpen({ step: 'remove', wallet });
            }}
          >
            {t('wallets.remove')}
          </Button>
        </>
      ),
    },
  ];

  return (
    <ConsolePage>
      <PageTitle
        title={t('nav.wallets')}
        lead={t('wallets.lead')}
        actions={
          <Button
            type="button"
            small
            fit
            className="flex-[1_1_auto] sm:flex-none"
            onClick={() => {
              setOpen({ step: 'new' });
            }}
          >
            <ConsoleIcon name="plus" size={18} />
            {t('wallets.new')}
          </Button>
        }
      />
      {update.isError ? <ErrorBanner message={errorMessage(update.error, t)} /> : null}
      {wallets.isError ? (
        <LoadFailed
          onRetry={() => {
            void wallets.refetch();
          }}
        />
      ) : (
        <DataTable
          columns={columns}
          rows={sorted}
          rowKey={(wallet) => wallet.id}
          loading={wallets.isLoading}
          empty={
            <EmptyBox icon="wallet" title={t('wallets.empty')} hint={t('wallets.emptyHint')} />
          }
        />
      )}
      <LaterCard heading="h2" title={t('wallets.gateways')} hint={t('wallets.gatewaysHint')} />
      {open?.step === 'new' ? (
        <WalletPanel
          wallet={null}
          nextOrder={Math.max(0, ...sorted.map((wallet) => wallet.displayOrder)) + 1}
          onClose={close}
        />
      ) : null}
      {open?.step === 'edit' ? (
        <WalletPanel wallet={open.wallet} nextOrder={open.wallet.displayOrder} onClose={close} />
      ) : null}
      {open?.step === 'remove' ? <RemovePanel wallet={open.wallet} onClose={close} /> : null}
    </ConsolePage>
  );
}
