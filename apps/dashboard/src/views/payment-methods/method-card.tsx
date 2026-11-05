import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { PaymentWay } from '@lytronix/validators';
import { Icon } from '@/components/icon';
import { MethodMark } from '@/components/method-mark';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { RadioMark } from '@/components/ui/kv';
import { RowList } from '@/components/ui/list-row';
import { StatusTag } from '@/components/ui/status-tag';
import { Switch } from '@/components/ui/switch';
import { useShell } from '@/shell/shell-context';
import type { PaymentAccount, PaymentMethodRow } from '@/types/payment-methods';
import { accountNumberOf, methodName, typeWord } from './words';

const linkClass = 'font-semibold whitespace-nowrap text-primary underline';

/** Payment methods' way to Listener phones (the prototype's `pm33Pair`). */
function PairLink(): React.JSX.Element {
  const { t } = useTranslation('menu');
  const { slug } = useShell();
  return (
    <Link to="/$shop/settings/listener" params={{ shop: slug }} className={linkClass}>
      {t('lpPair')}
    </Link>
  );
}

/** What an account is, in its row's line of chips: its type, Active, Automated, Test. */
function AccountChips({ account }: { account: PaymentAccount }): React.JSX.Element {
  const { t } = useTranslation('menu');
  return (
    <span className="mt-1.5 flex flex-wrap gap-1">
      {account.accountType ? (
        <StatusTag tone="neutral">{typeWord(account.accountType, t)}</StatusTag>
      ) : null}
      {account.active ? <StatusTag tone="ok">{t('pmActive')}</StatusTag> : null}
      {account.automated ? <StatusTag tone="ok">{t('pmAutomated')}</StatusTag> : null}
      {account.automated && account.sandbox ? (
        <StatusTag tone="warn">{t('pmTest')}</StatusTag>
      ) : null}
    </span>
  );
}

function AccountLines({ account }: { account: PaymentAccount }): React.JSX.Element {
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="num min-w-0 overflow-hidden text-[15px] font-medium text-ellipsis whitespace-nowrap">
        {accountNumberOf(account)}
      </span>
      <span className="overflow-hidden text-[14px] text-ellipsis whitespace-nowrap text-fg-muted">
        {account.bankName ? `${account.bankName} · ${account.accountName}` : account.accountName}
      </span>
      <AccountChips account={account} />
    </span>
  );
}

/** A way of taking the money: its radio, what it is, and anything it says when chosen under it. */
function WayRow({
  on,
  title,
  about,
  disabled,
  onChoose,
  children,
}: {
  on: boolean;
  title: string;
  about: string;
  disabled: boolean;
  onChoose: () => void;
  children?: ReactNode;
}): React.JSX.Element {
  return (
    <div className="py-2.5">
      <button
        type="button"
        role="radio"
        aria-checked={on}
        disabled={disabled}
        onClick={onChoose}
        className="flex min-h-11 w-full items-start gap-3 text-left"
      >
        <span className="mt-px flex">
          <RadioMark on={on} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[15px] font-medium">{title}</span>
          <span className="text-[14px] text-fg-muted">{about}</span>
        </span>
      </button>
      {children ? <div className="pl-[34px]">{children}</div> : null}
    </div>
  );
}

interface MethodCardProps {
  row: PaymentMethodRow;
  owner: boolean;
  busy: boolean;
  /** The platform's current fees, as percentages (RAT-15, RAT-16). */
  fees: { automated: string; listener: string };
  /** How many listener phones work now. */
  phones: number;
  onSwitch: (on: boolean) => void;
  onMakeActive: (account: PaymentAccount) => void;
  onEdit: (account: PaymentAccount) => void;
  onAdd: () => void;
  onWay: (way: PaymentWay) => void;
  onKeys: () => void;
}

/**
 * A method's card (TENANT-DASHBOARD-DESIGN §7.35, the prototype's `pm33Card`): its mark, name and active number with
 * the on/off switch. Off, it folds to that head. On, its accounts with one active; a warning when customers can't pay
 * by it yet; how its money is taken where there's more than one way; Add account. Staff read the same with no controls.
 */
export function MethodCard({
  row,
  owner,
  busy,
  fees,
  phones,
  onSwitch,
  onMakeActive,
  onEdit,
  onAdd,
  onWay,
  onKeys,
}: MethodCardProps): React.JSX.Element {
  const { t } = useTranslation('menu');
  const name = methodName(row.method, t);
  const active = row.accounts.find((account) => account.active);
  const count = row.accounts.length;
  const sub = !row.enabled
    ? count > 0
      ? t('pmOffSaved', { count })
      : t('pmOff')
    : active
      ? t('pmActiveIs', { number: accountNumberOf(active) })
      : count > 0
        ? t('pmNoneActiveShort')
        : t('pmNoAccount');
  const warning =
    !row.enabled || !owner
      ? null
      : count === 0
        ? t('pmNeedAccount')
        : active
          ? null
          : t('pmNoneActive');
  const severalWays = row.ways.length > 1;
  const unreadable = row.accounts.some((account) => account.credentialsUnreadable);
  const hasKeys = unreadable || row.accounts.some((account) => account.hasCredentials);
  const wayWords: Record<PaymentWay, string> = {
    [PaymentWay.Automated]: t('pmWayAuto'),
    [PaymentWay.Listener]: t('pmWayListener'),
    [PaymentWay.Manual]: t('pmWayManual'),
  };

  return (
    <Card flush>
      <div className="flex min-h-[60px] items-center gap-3 px-4 py-3">
        <MethodMark method={row.method} name={name} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="overflow-hidden text-[16px] font-medium text-ellipsis whitespace-nowrap">
            {name}
          </span>
          <span className="num overflow-hidden text-[14px] text-ellipsis whitespace-nowrap text-fg-muted">
            {sub}
          </span>
        </span>
        {owner ? (
          <Switch
            checked={row.enabled}
            disabled={busy}
            label={t('pmSwitch', { wallet: name })}
            onChange={onSwitch}
          />
        ) : (
          <StatusTag tone={row.enabled ? 'ok' : 'neutral'}>
            {row.enabled ? t('pmOn') : t('pmOff')}
          </StatusTag>
        )}
      </div>

      {row.enabled && count > 0 ? (
        <RowList
          role={owner ? 'radiogroup' : undefined}
          aria-label={owner ? name : undefined}
          className="border-t border-line"
        >
          {row.accounts.map((account) => (
            <div key={account.id} className="flex min-h-16 items-center gap-3 px-4 py-3">
              {owner ? (
                <button
                  type="button"
                  role="radio"
                  aria-checked={account.active}
                  aria-label={t('pmMakeActive', { number: accountNumberOf(account) })}
                  disabled={busy}
                  onClick={() => {
                    if (!account.active) onMakeActive(account);
                  }}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <RadioMark on={account.active} />
                  <AccountLines account={account} />
                </button>
              ) : (
                <AccountLines account={account} />
              )}
              {owner ? (
                <button
                  type="button"
                  aria-label={`${t('pmEdit')} ${accountNumberOf(account)}`}
                  className={linkClass}
                  onClick={() => {
                    onEdit(account);
                  }}
                >
                  {t('pmEdit')}
                </button>
              ) : null}
            </div>
          ))}
        </RowList>
      ) : null}

      {warning ? (
        <div className="px-4 pb-3">
          <Banner tone="warn">{warning}</Banner>
        </div>
      ) : null}

      {row.enabled && owner && unreadable ? (
        <div className="px-4 pb-3">
          <Banner
            tone="warn"
            action={
              <button type="button" className="text-primary" onClick={onKeys}>
                {t('pmReEnter')}
              </button>
            }
          >
            {t('pmUnreadable')}
          </Banner>
        </div>
      ) : null}

      {row.enabled && severalWays && owner ? (
        <div className="border-t border-line px-4 pt-3 pb-1">
          <div id={`way-${row.method}`} className="text-[14px] font-semibold">
            {t('pmWayTitle')}
          </div>
          <div role="radiogroup" aria-labelledby={`way-${row.method}`}>
            <WayRow
              on={row.way === PaymentWay.Automated}
              disabled={busy}
              title={t('pmWayAuto')}
              about={t('pmWayAutoD', { fee: fees.automated })}
              onChoose={() => {
                onWay(PaymentWay.Automated);
              }}
            >
              <div className="mt-1.5">
                <button type="button" className={linkClass} onClick={onKeys}>
                  {hasKeys ? t('pmManageKeys') : t('pmConnect')}
                </button>
              </div>
              {row.way === PaymentWay.Automated ? (
                <p className="mt-1.5 text-[14px] text-fg-muted">{t('pmAutoNote')}</p>
              ) : null}
            </WayRow>
            <WayRow
              on={row.way === PaymentWay.Listener}
              disabled={busy}
              title={t('pmWayListener')}
              about={t('pmWayListenerD', { fee: fees.listener })}
              onChoose={() => {
                onWay(PaymentWay.Listener);
              }}
            >
              {row.way === PaymentWay.Listener ? (
                <p className="mt-1.5 text-[14px] text-fg-muted">
                  {phones > 0 ? t('pmPaired', { count: phones }) : t('pmNoPaired')} <PairLink />
                </p>
              ) : null}
            </WayRow>
            <WayRow
              on={row.way === PaymentWay.Manual}
              disabled={busy}
              title={t('pmWayManual')}
              about={t('pmWayManualD')}
              onChoose={() => {
                onWay(PaymentWay.Manual);
              }}
            />
          </div>
        </div>
      ) : null}

      {row.enabled && severalWays && !owner ? (
        <p className="border-t border-line px-4 py-3 text-[14px] text-fg-muted">
          {t('pmWayIs', { way: wayWords[row.way] })}
        </p>
      ) : null}

      {row.enabled && !severalWays ? (
        <p className="border-t border-line px-4 py-2.5 text-[14px] text-fg-muted">
          {t('pmManualOnly')}
        </p>
      ) : null}

      {row.enabled && owner ? (
        <div className="flex gap-2 px-4 pt-2 pb-3">
          <Button tone="outline" size="sm" onClick={onAdd}>
            <Icon name="plus" />
            {t('pmAdd')}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
