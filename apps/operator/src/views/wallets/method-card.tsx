import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PaymentMethodKind, PaymentWay } from '@lytronix/validators';
import { errorMessage } from '@lytronix/api-client';
import { Button, ErrorBanner } from '@lytronix/ui';
import { useUpdatePaymentMethod } from '@/api/payment-methods';
import { useUpdatePlatformWallet } from '@/api/platform-wallets';
import { Banner } from '@/components/ui/banner';
import { ConsoleIcon } from '@/components/ui/console-icon';
import { QUIET_BUTTON, SMALL_BUTTON } from '@/components/ui/sizes';
import { StatusChip } from '@/components/ui/status-chip';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import type { LytroBankAccount, LytroPaymentMethod, PlatformWallet } from '@/types/operator';
import { METHOD_NAMES, providerColour } from './providers';

export type MethodOpen =
  | { step: 'new-number'; provider: string }
  | { step: 'edit' | 'remove'; wallet: PlatformWallet }
  | { step: 'bank'; account: LytroBankAccount | null }
  | { step: 'keys'; method: LytroPaymentMethod }
  | { step: 'off-last'; method: string };

function NumberRow({
  wallet,
  onOpen,
}: {
  wallet: PlatformWallet;
  onOpen: (open: MethodOpen) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const update = useUpdatePlatformWallet();
  return (
    <div className="flex min-h-[52px] flex-wrap items-center gap-x-3 gap-y-2 border-t border-line px-4 py-3">
      <span className="flex min-w-[150px] flex-1 flex-col gap-0.5">
        <span className="mono text-[15px] font-medium">{wallet.number}</span>
        <span className="text-[13px] text-fg-muted">{wallet.label ?? t('wallets.none')}</span>
      </span>
      <Switch
        checked={wallet.enabled}
        disabled={update.isPending}
        label={t('wallets.shown')}
        showLabel
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
      <Button
        type="button"
        tone="outline"
        small
        fit
        className={SMALL_BUTTON}
        onClick={() => {
          onOpen({ step: 'edit', wallet });
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
          onOpen({ step: 'remove', wallet });
        }}
      >
        {t('wallets.remove')}
      </Button>
    </div>
  );
}

function BankRow({
  account,
  onOpen,
}: {
  account: LytroBankAccount;
  onOpen: (open: MethodOpen) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-[52px] flex-wrap items-center gap-x-3 gap-y-2 border-t border-line px-4 py-3">
      <span className="flex min-w-[150px] flex-1 flex-col gap-0.5">
        <span className="text-[15px] font-medium">
          {account.branch ? `${account.bankName} · ${account.branch}` : account.bankName}
        </span>
        <span className="mono text-[13px] text-fg-muted">
          {account.accountName} · {account.accountNumber}
        </span>
      </span>
      <Button
        type="button"
        tone="outline"
        small
        fit
        className={SMALL_BUTTON}
        onClick={() => {
          onOpen({ step: 'bank', account });
        }}
      >
        {t('common.edit')}
      </Button>
    </div>
  );
}

const WAY_KEY: Record<PaymentWay, 'auto' | 'listener' | 'manual'> = {
  [PaymentWay.Automated]: 'auto',
  [PaymentWay.Listener]: 'listener',
  [PaymentWay.Manual]: 'manual',
};

function WayRow({
  way,
  on,
  disabled,
  onChoose,
  children,
}: {
  way: PaymentWay;
  on: boolean;
  disabled: boolean;
  onChoose: () => void;
  children?: React.ReactNode;
}): React.JSX.Element {
  const { t } = useTranslation();
  const key = WAY_KEY[way];
  return (
    <div className="flex items-start gap-3 py-2.5">
      <button
        type="button"
        role="radio"
        aria-checked={on}
        aria-label={t(`wallets.way_${key}`)}
        disabled={disabled}
        onClick={onChoose}
        className={`relative mt-0.5 size-[18px] flex-none rounded-full border-2 ${
          on ? 'border-primary' : 'border-neutral-400'
        }`}
      >
        {on ? <span className="absolute inset-[3px] rounded-full bg-primary" /> : null}
      </button>
      <div className="min-w-0">
        <div className="text-[15px] font-medium">{t(`wallets.way_${key}`)}</div>
        <div className="text-[13px] leading-normal text-fg-muted">{t(`wallets.way_${key}_d`)}</div>
        {children}
      </div>
    </div>
  );
}

/** OPERATOR-CONSOLE-DESIGN §10: one method: on or off, its numbers or bank accounts, and how its payments are confirmed. */
export function MethodCard({
  view,
  numbers,
  bankAccounts,
  phonesOnline,
  lastOn,
  onOpen,
}: {
  view: LytroPaymentMethod;
  numbers: readonly PlatformWallet[];
  bankAccounts: readonly LytroBankAccount[];
  phonesOnline: number;
  /** The only method on: turning it off asks first. */
  lastOn: boolean;
  onOpen: (open: MethodOpen) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const update = useUpdatePaymentMethod();
  const bank = view.kind === PaymentMethodKind.Bank;
  const name = METHOD_NAMES[view.method] ?? view.method;
  const label = bank ? t('wallets.bank') : name;
  const count = bank ? bankAccounts.length : numbers.length;
  const wayName = t(`wallets.way_${WAY_KEY[view.way]}`);
  const shown = bank
    ? bankAccounts.some((each) => each.enabled)
    : numbers.some((each) => each.enabled);
  const sub = !view.enabled
    ? t('wallets.off')
    : t(bank ? 'wallets.accountsCount' : 'wallets.numbersCount', { count, way: wayName });

  function choose(way: PaymentWay): void {
    if (way === view.way) return;
    if (way === PaymentWay.Automated && !view.gateway?.connected) {
      onOpen({ step: 'keys', method: view });
      return;
    }
    update.mutate({ method: view.method, way });
  }

  return (
    <section
      aria-label={label}
      className="overflow-hidden rounded-card border border-line bg-surface"
    >
      <div className="flex min-h-[60px] items-center gap-3 px-4 py-3">
        <span className="flex size-10 flex-none items-center justify-center rounded-lg border border-line bg-white">
          <span
            className="size-3 rounded-full"
            style={{ background: bank ? 'var(--n700, #404040)' : providerColour(name) }}
          />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[15px] font-medium">{label}</span>
          <span className="text-[13px] text-fg-muted">{sub}</span>
        </span>
        <Switch
          checked={view.enabled}
          disabled={update.isPending}
          label={t('wallets.methodOn', { method: label })}
          onChange={(enabled) => {
            if (!enabled && lastOn) {
              onOpen({ step: 'off-last', method: view.method });
              return;
            }
            update.mutate({ method: view.method, enabled });
          }}
        />
      </div>
      {update.isError ? (
        <div className="px-4 pb-3">
          <ErrorBanner message={errorMessage(update.error, t)} />
        </div>
      ) : null}
      {view.enabled ? (
        <>
          {bank
            ? bankAccounts.map((account) => (
                <BankRow key={account.id} account={account} onOpen={onOpen} />
              ))
            : numbers.map((wallet) => (
                <NumberRow key={wallet.id} wallet={wallet} onOpen={onOpen} />
              ))}
          {!shown ? (
            <div className="px-4 pb-3 pt-1">
              <Banner tone="warn" icon="warn">
                {t('wallets.needNumber')}
              </Banner>
            </div>
          ) : null}
          {view.ways.length > 1 ? (
            <div
              role="radiogroup"
              aria-label={t('wallets.wayTitle')}
              className="border-t border-line px-4 py-3"
            >
              <div className="mb-0.5 text-[14px] font-semibold">{t('wallets.wayTitle')}</div>
              {view.ways.map((way) => (
                <WayRow
                  key={way}
                  way={way}
                  on={way === view.way}
                  disabled={update.isPending}
                  onChoose={() => {
                    choose(way);
                  }}
                >
                  {way === PaymentWay.Automated ? (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {view.gateway?.connected ? (
                        <>
                          <StatusChip tone="ok">{t('wallets.connected')}</StatusChip>
                          {view.gateway.sandbox ? (
                            <StatusChip tone="warn">{t('wallets.sandbox')}</StatusChip>
                          ) : null}
                        </>
                      ) : null}
                      <button
                        type="button"
                        className="text-[13px] font-semibold text-primary"
                        onClick={() => {
                          onOpen({ step: 'keys', method: view });
                        }}
                      >
                        {view.gateway?.connected ? t('wallets.manageKeys') : t('wallets.connect')}
                      </button>
                    </div>
                  ) : null}
                  {way === PaymentWay.Listener && view.way === PaymentWay.Listener ? (
                    phonesOnline > 0 ? (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <StatusChip tone="ok">
                          {t('wallets.phonesOnline', { count: phonesOnline })}
                        </StatusChip>
                        <Link to="/phones" className="text-[13px] font-semibold text-primary">
                          {t('wallets.phonesLink')}
                        </Link>
                      </div>
                    ) : (
                      <div className="mt-2">
                        <Banner tone="warn" icon="warn">
                          {t('wallets.noPhone')}
                        </Banner>
                      </div>
                    )
                  ) : null}
                </WayRow>
              ))}
            </div>
          ) : (
            <div className="border-t border-line px-4 py-2.5 text-[13px] text-fg-muted">
              {bank ? t('wallets.bankManual') : t('wallets.onlyManual')}
            </div>
          )}
          <div className="flex flex-wrap gap-2 px-4 pb-3 pt-2">
            <Button
              type="button"
              tone="outline"
              small
              fit
              onClick={() => {
                onOpen(
                  bank ? { step: 'bank', account: null } : { step: 'new-number', provider: name },
                );
              }}
            >
              <ConsoleIcon name="plus" size={18} />
              {bank ? t('wallets.addBank') : t('wallets.addNumber')}
            </Button>
          </div>
        </>
      ) : null}
    </section>
  );
}
