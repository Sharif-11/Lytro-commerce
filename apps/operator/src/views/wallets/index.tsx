import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '@lytronix/api-client';
import { usePaymentMethods } from '@/api/payment-methods';
import { useLytroPhones } from '@/api/phones';
import { useDeletePlatformWallet, usePlatformWallets } from '@/api/platform-wallets';
import { ActionPanel } from '@/components/ui/action-panel';
import { Banner } from '@/components/ui/banner';
import { Consequence } from '@/components/ui/consequence';
import { ConsolePage, PageTitle } from '@/components/ui/console-page';
import { LoadFailed } from '@/components/ui/load-failed';
import { useToast } from '@/components/ui/use-toast';
import type { PlatformWallet } from '@/types/operator';
import { MethodCard, type MethodOpen } from './method-card';
import { BankPanel, GatewayPanel, TurnOffLastPanel } from './panels';
import { WalletPanel } from './wallet-panel';

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

/** OPERATOR-CONSOLE-DESIGN §10: what shops can pay Lytro by, and how each payment is confirmed. */
export function Wallets(): React.JSX.Element {
  const { t } = useTranslation();
  const methods = usePaymentMethods();
  const wallets = usePlatformWallets();
  const phones = useLytroPhones();
  const [open, setOpen] = useState<MethodOpen | null>(null);
  const close = (): void => {
    setOpen(null);
  };
  const sorted = [...(wallets.data ?? [])].sort((a, b) => a.displayOrder - b.displayOrder);
  const numbersOf = (method: string): PlatformWallet[] =>
    sorted.filter((wallet) => wallet.provider.toLowerCase() === method);
  const views = methods.data?.methods ?? [];
  const on = views.filter((view) => view.enabled);
  const phonesOnline = (phones.data?.devices ?? []).filter((device) => device.online).length;
  const failed = methods.isError || wallets.isError;

  return (
    <ConsolePage>
      <PageTitle title={t('nav.wallets')} lead={t('wallets.lead')} />
      {failed ? (
        <LoadFailed
          onRetry={() => {
            void methods.refetch();
            void wallets.refetch();
          }}
        />
      ) : null}
      {!failed && methods.data && on.length === 0 ? (
        <Banner tone="bad" icon="warn">
          {t('wallets.noneOn')}
        </Banner>
      ) : null}
      <div className="flex max-w-[720px] flex-col gap-4">
        {views.map((view) => (
          <MethodCard
            key={view.method}
            view={view}
            numbers={numbersOf(view.method)}
            bankAccounts={methods.data?.bankAccounts ?? []}
            phonesOnline={phonesOnline}
            lastOn={view.enabled && on.length === 1}
            onOpen={setOpen}
          />
        ))}
      </div>
      {open?.step === 'new-number' ? (
        <WalletPanel
          wallet={null}
          provider={open.provider}
          nextOrder={Math.max(0, ...sorted.map((wallet) => wallet.displayOrder)) + 1}
          onClose={close}
        />
      ) : null}
      {open?.step === 'edit' ? (
        <WalletPanel wallet={open.wallet} nextOrder={open.wallet.displayOrder} onClose={close} />
      ) : null}
      {open?.step === 'remove' ? <RemovePanel wallet={open.wallet} onClose={close} /> : null}
      {open?.step === 'bank' ? <BankPanel account={open.account} onClose={close} /> : null}
      {open?.step === 'keys' && open.method.gateway ? (
        <GatewayPanel
          method={open.method.method}
          numbers={numbersOf(open.method.method)}
          gateway={open.method.gateway}
          onClose={close}
        />
      ) : null}
      {open?.step === 'off-last' ? <TurnOffLastPanel method={open.method} onClose={close} /> : null}
    </ConsolePage>
  );
}
