import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PaymentWay, RateKey } from '@lytronix/validators';
import { useCurrentRates } from '@/api/balance';
import { useListenerPhones } from '@/api/listener';
import {
  useChooseWay,
  usePaymentMethods,
  useSaveMethod,
  useSelectAutomated,
} from '@/api/payment-methods';
import { Banner } from '@/components/ui/banner';
import { Card } from '@/components/ui/card';
import { SkeletonRows } from '@/components/ui/skeleton';
import { useErrorText } from '@/hooks/use-error-text';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';
import type { PaymentAccount, PaymentMethodRow } from '@/types/payment-methods';
import { AccountSheet, DeleteAccountDialog } from './account-sheets';
import { GatewaySheet } from './gateway-sheet';
import { MethodCard } from './method-card';
import { PhoneSheet } from './phone-sheet';
import { bodyOf } from './words';

// What's open over the page. Each names the method, read fresh from the page's own answer, so a sheet never saves a stale
// list after another save.
type Open =
  | { kind: 'account'; method: PaymentMethodRow['method']; accountId: string | null }
  | { kind: 'delete'; method: PaymentMethodRow['method']; accountId: string }
  | { kind: 'keys'; method: PaymentMethodRow['method'] }
  | { kind: 'phone' };

/** A rate as the page writes a fee: two decimals, as the prototype's 1.00 and 0.10. */
function feeOf(value: string | undefined): string {
  return value === undefined ? '–' : Number(value).toFixed(2);
}

/**
 * Settings > Payment methods (TENANT-DASHBOARD-DESIGN §7.35, the prototype's `pm33`; WAL-01 to WAL-21): one card per
 * method under a line saying the money comes straight to the shop, over one saying cash on delivery needs nothing here.
 * Only the owner changes anything (WAL-07); staff who can view read the same with no controls. An owner with no verified
 * phone isn't locked out, and verifies it here (TVR-01).
 */
export function PaymentMethodsView(): React.JSX.Element {
  const { t } = useTranslation('menu');
  const errorText = useErrorText();
  const { viewer } = useShell();
  const owner = viewer.isOwner;
  const view = usePaymentMethods();
  const rates = useCurrentRates({ enabled: owner });
  const phones = useListenerPhones({ enabled: owner });
  const save = useSaveMethod();
  const way = useChooseWay();
  const select = useSelectAutomated();
  const [open, setOpen] = useState<Open | null>(null);
  const close = (): void => {
    setOpen(null);
  };

  const methods = view.data?.methods ?? [];
  const rateOf = (key: RateKey): string | undefined =>
    rates.data?.find((rate) => rate.key === key)?.value;
  const fees = {
    automated: feeOf(rateOf(RateKey.GatewayVerificationPct)),
    listener: feeOf(rateOf(RateKey.ListenerVerificationPct)),
  };
  const first = view.isSuccess && methods.every((row) => !row.enabled && row.accounts.length === 0);
  const failure = view.error ?? save.error ?? way.error ?? select.error;
  const busy = save.isPending || way.isPending || select.isPending;
  const noPhone = view.data?.ownerPhoneVerified === false;

  const rowOf = (method: PaymentMethodRow['method']): PaymentMethodRow | undefined =>
    methods.find((row) => row.method === method);
  const accountOf = (row: PaymentMethodRow, id: string | null): PaymentAccount | null =>
    row.accounts.find((account) => account.id === id) ?? null;

  const makeActive = (row: PaymentMethodRow, chosen: PaymentAccount): void => {
    save.mutate({
      method: row.method,
      input: {
        enabled: row.enabled,
        accounts: row.accounts.map((account) => ({
          ...bodyOf(account),
          active: account.id === chosen.id,
        })),
      },
    });
  };

  // Automated needs keys, and an account chosen to run on (WAL-10); with no keys it opens their sheet.
  const chooseWay = async (row: PaymentMethodRow, next: PaymentWay): Promise<void> => {
    if (next === row.way) return;
    if (next === PaymentWay.Automated) {
      const keyed =
        row.accounts.find((account) => account.automated && account.hasCredentials) ??
        row.accounts.find((account) => account.hasCredentials);
      if (!keyed) {
        setOpen({ kind: 'keys', method: row.method });
        return;
      }
      if (!keyed.automated) await select.mutateAsync(keyed.id);
    }
    await way.mutateAsync({ method: row.method, way: next });
  };

  const sheetRow = open && open.kind !== 'phone' ? rowOf(open.method) : undefined;

  return (
    <ShellPage>
      {/* With no controls, staff have nothing else to land on, so the keyboard could not scroll the page to read it. */}
      <div className="flex max-w-[640px] flex-col gap-3.5" tabIndex={owner ? undefined : 0}>
        <p className="text-[14px] text-fg-muted">{t('pmLead')}</p>
        {failure ? <Banner tone="bad">{errorText(failure)}</Banner> : null}
        {!owner && view.isSuccess ? <Banner tone="neutral">{t('pmStaff')}</Banner> : null}
        {noPhone ? (
          <Banner
            tone="warn"
            action={
              owner ? (
                <button
                  type="button"
                  className="text-primary"
                  onClick={() => {
                    setOpen({ kind: 'phone' });
                  }}
                >
                  {t('pmVerifyNow')}
                </button>
              ) : undefined
            }
          >
            {t('pmNoPhone')}
          </Banner>
        ) : null}
        {first && owner ? <Banner tone="info">{t('pmFirst')}</Banner> : null}
        {view.isPending ? (
          <Card flush>
            <SkeletonRows count={5} />
          </Card>
        ) : (
          methods.map((row) => (
            <MethodCard
              key={row.method}
              row={row}
              owner={owner}
              busy={busy}
              fees={fees}
              phones={phones.data?.active ?? 0}
              onSwitch={(on) => {
                save.mutate({
                  method: row.method,
                  input: { enabled: on, accounts: row.accounts.map(bodyOf) },
                });
              }}
              onMakeActive={(account) => {
                makeActive(row, account);
              }}
              onEdit={(account) => {
                setOpen({ kind: 'account', method: row.method, accountId: account.id });
              }}
              onAdd={() => {
                setOpen({ kind: 'account', method: row.method, accountId: null });
              }}
              onWay={(next) => {
                chooseWay(row, next).catch(() => undefined);
              }}
              onKeys={() => {
                setOpen({ kind: 'keys', method: row.method });
              }}
            />
          ))
        )}
        <p className="text-[14px] text-fg-muted">{t('pmCod')}</p>
      </div>

      {open?.kind === 'phone' ? <PhoneSheet onClose={close} /> : null}
      {open?.kind === 'account' && sheetRow ? (
        <AccountSheet
          row={sheetRow}
          account={accountOf(sheetRow, open.accountId)}
          onClose={close}
          onDelete={(account) => {
            setOpen({ kind: 'delete', method: sheetRow.method, accountId: account.id });
          }}
        />
      ) : null}
      {open?.kind === 'delete' && sheetRow
        ? (() => {
            const account = accountOf(sheetRow, open.accountId);
            return account ? (
              <DeleteAccountDialog row={sheetRow} account={account} onClose={close} />
            ) : null;
          })()
        : null}
      {open?.kind === 'keys' && sheetRow ? (
        <GatewaySheet row={sheetRow} fee={fees.automated} onClose={close} />
      ) : null}
    </ShellPage>
  );
}
