import { useState, type ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { ApiClientError, errorMessage } from '@lytronix/api-client';
import { Button } from '@lytronix/ui';
import { bdMobileNumber, LAPSED_TENANT_STATES, PLAN_EXTEND_MAX_DAYS } from '@lytronix/validators';
import { useDeleteShopData, useExtendPlan, useOwnerReset } from '@/api/shops';
import { ActionPanel } from '@/components/ui/action-panel';
import { Banner } from '@/components/ui/banner';
import { Consequence } from '@/components/ui/consequence';
import { ReasonField } from '@/components/ui/reason-field';
import { SMALL_BUTTON } from '@/components/ui/sizes';
import { useToast } from '@/components/ui/use-toast';
import { formatDay } from '@/lib/format';
import { spacedPhone } from '@/lib/phone-words';
import type { OperatorShop } from '@/types/operator';

const BOLD = { b: <b className="font-semibold" /> };
const DAY_MS = 24 * 60 * 60 * 1000;

/** A field as the sketch draws one in a panel: its label, the input, the help under it and, when refused, why. */
function PanelField({
  label,
  help,
  error,
  children,
}: {
  label: string;
  help?: ReactNode;
  error?: string | null;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-neutral-700">{label}</span>
        {children}
      </label>
      {help ? <span className="text-[13px] text-fg-subtle">{help}</span> : null}
      {error ? (
        <span role="alert" className="text-[13px] text-danger">
          {error}
        </span>
      ) : null}
    </div>
  );
}

function inputClass(refused: boolean): string {
  return `mono h-11 w-full rounded-control border bg-surface px-3 text-[14px] text-ink focus:ring-2 focus:outline-none ${
    refused
      ? 'border-danger focus:ring-field-error-ring'
      : 'border-line-strong focus:border-line-active focus:ring-field-ring'
  }`;
}

interface AccountPanelProps {
  shop: OperatorShop;
  onClose: () => void;
}

/**
 * ADM-04, D8-12, D8-32 to D8-35: whole days on the period's end, free, with a reason; a lapsed shop comes back at once.
 * Days that still end in the past are refused, and the panel offers a plan instead.
 */
export function ExtendPanel({
  shop,
  onClose,
  onAssign,
}: AccountPanelProps & { onAssign: () => void }): React.JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const extend = useExtendPlan();
  const [days, setDays] = useState('7');
  const [reason, setReason] = useState('');
  const periodEnd = shop.periodEnd ?? '';
  const count = Number(days);
  const valid = /^\d+$/.test(days.trim()) && count >= 1 && count <= PLAN_EXTEND_MAX_DAYS;
  const newEnd = valid
    ? new Date(new Date(periodEnd).getTime() + count * DAY_MS).toISOString()
    : null;
  // D8-33: days that still end in the past are refused, by the server's own rule, so the panel says so before sending.
  const stillEnded =
    newEnd !== null &&
    (new Date(newEnd).getTime() <= Date.now() ||
      (extend.error instanceof ApiClientError && extend.error.code === 'conflict'));
  const lapsed = LAPSED_TENANT_STATES.includes(shop.state);
  const plan = `${shop.planName ?? '—'}${shop.planVersion === null ? '' : ` v${String(shop.planVersion)}`}`;

  return (
    <ActionPanel
      title={t('p88shops.extendTitle', { shop: shop.shopName })}
      sub={t('p88shops.extendSub', { plan, d: formatDay(periodEnd) })}
      onClose={onClose}
      actionLabel={valid ? t('p88shops.extendButton', { n: count }) : t('p88shops.extend')}
      pending={extend.isPending}
      canSubmit={valid && reason.trim() !== ''}
      error={extend.isError && !stillEnded ? errorMessage(extend.error, t) : null}
      onSubmit={() => {
        extend.mutate(
          { shopId: shop.id, days: count, reason: reason.trim() },
          {
            onSuccess: (done) => {
              toast(
                t('p88shops.extendDone', { shop: shop.shopName, d: formatDay(done.periodEnd) }),
              );
              onClose();
            },
          },
        );
      }}
    >
      {stillEnded ? (
        <Banner tone="bad" icon="warn">
          {t('p88shops.extendEnded')}
          <div className="mt-2">
            <Button
              type="button"
              tone="outline"
              small
              fit
              className={SMALL_BUTTON}
              onClick={onAssign}
            >
              {t('p88shops.extendAssign')}
            </Button>
          </div>
        </Banner>
      ) : null}
      <PanelField
        label={t('p88shops.extendDays')}
        help={
          <>
            {newEnd
              ? `${t('p88shops.extendNew', { a: formatDay(newEnd), b: formatDay(periodEnd) })} · `
              : null}
            {t('p88shops.extendDaysHelp')}
          </>
        }
      >
        <input
          name="days"
          inputMode="numeric"
          autoComplete="off"
          value={days}
          onChange={(event) => {
            setDays(event.target.value);
            extend.reset();
          }}
          className={`${inputClass(false)} max-w-[140px]`}
        />
      </PanelField>
      <Consequence>{t('p88shops.extendConsequence', { plan: shop.planName ?? '—' })}</Consequence>
      {lapsed && !stillEnded ? (
        <Consequence tone="ok">
          <Trans
            i18nKey="p88shops.extendLapsed"
            values={{ shop: shop.shopName, state: t(`states.${shop.state}`) }}
            components={BOLD}
          />
        </Consequence>
      ) : null}
      <ReasonField value={reason} onChange={setReason} help={t('p88shops.reasonHelp')} />
    </ActionPanel>
  );
}

/**
 * ADM-04, D8-5, D8-36, D8-38: the owner signed out everywhere and a reset code sent to the phone they gave, which replaces
 * the account's at once when it differs. The operator never sees or sets the password.
 */
export function OwnerResetPanel({
  shop,
  owner,
  onClose,
}: AccountPanelProps & {
  owner: { name: string | null; phone: string | null };
}): React.JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const reset = useOwnerReset();
  const account = owner.phone ? spacedPhone(owner.phone) : '';
  const [phone, setPhone] = useState(account);
  const [reason, setReason] = useState('');
  const typed = bdMobileNumber(phone);
  const taken =
    reset.error instanceof ApiClientError && reset.error.code === 'conflict' && typed !== null;
  const changed = typed !== null && owner.phone !== null && typed !== bdMobileNumber(owner.phone);
  const bad = phone.trim() !== '' && typed === null;

  return (
    <ActionPanel
      title={t('p88shops.resetTitle')}
      sub={owner.name ? `${shop.shopName} · ${owner.name}` : shop.shopName}
      onClose={onClose}
      actionLabel={t('p88shops.resetSend')}
      danger
      pending={reset.isPending}
      canSubmit={typed !== null && reason.trim() !== ''}
      error={reset.isError && !taken ? errorMessage(reset.error, t) : null}
      onSubmit={() => {
        if (typed === null) return;
        reset.mutate(
          { shopId: shop.id, phone: typed, reason: reason.trim() },
          {
            onSuccess: () => {
              toast(t('p88shops.resetDone'));
              onClose();
            },
          },
        );
      }}
    >
      <Banner tone="info" icon="shield">
        {t('p88shops.resetCheck')}
      </Banner>
      <PanelField
        label={t('p88shops.resetPhone')}
        help={account ? t('p88shops.resetPhoneHelp', { p: account }) : null}
        error={taken ? t('p88shops.resetTaken') : bad ? t('p88shops.resetPhoneBad') : null}
      >
        <input
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          value={phone}
          onChange={(event) => {
            setPhone(event.target.value);
            reset.reset();
          }}
          className={inputClass(taken || bad)}
        />
      </PanelField>
      <Consequence tone="danger">{t('p88shops.resetConsequence')}</Consequence>
      {changed && !taken ? (
        <Consequence>
          <Trans i18nKey="p88shops.resetChanged" values={{ p: account }} components={BOLD} />
        </Consequence>
      ) : null}
      <ReasonField value={reason} onChange={setReason} help={t('p88shops.reasonHelp')} />
    </ActionPanel>
  );
}

/**
 * ADM-13, D8-13, D8-37: the shop offline at once, as archived, and its data deleted by the day-60 steps; the account,
 * balance and billing records stay. Its address, typed out, turns the button on.
 */
export function DeleteDataPanel({ shop, onClose }: AccountPanelProps): React.JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const remove = useDeleteShopData();
  const [typed, setTyped] = useState('');
  const [reason, setReason] = useState('');
  const address = typed.trim();
  const matches = address === shop.slug;
  const wrong = address !== '' && !matches && !shop.slug.startsWith(address);

  return (
    <ActionPanel
      title={t('p88shops.deleteTitle', { shop: shop.shopName })}
      sub={`${shop.slug}.lytro.app`}
      onClose={onClose}
      actionLabel={t('p88shops.deleteSend')}
      danger
      pending={remove.isPending}
      canSubmit={matches && reason.trim() !== ''}
      error={remove.isError ? errorMessage(remove.error, t) : null}
      onSubmit={() => {
        remove.mutate(
          { shopId: shop.id, confirmAddress: address, reason: reason.trim() },
          {
            onSuccess: () => {
              toast(t('p88shops.deleteDone', { shop: shop.shopName }));
              onClose();
            },
          },
        );
      }}
    >
      <Consequence tone="danger">
        <Trans
          i18nKey="p88shops.deleteConsequence"
          values={{ shop: shop.shopName }}
          components={BOLD}
        />
      </Consequence>
      <PanelField
        label={t('p88shops.deleteType')}
        help={
          <Trans
            i18nKey="p88shops.deleteTypeHelp"
            values={{ a: shop.slug }}
            components={{ b: <b className="mono font-semibold" /> }}
          />
        }
        error={wrong ? t('p88shops.deleteWrong') : null}
      >
        <input
          name="address"
          autoComplete="off"
          spellCheck={false}
          value={typed}
          onChange={(event) => {
            setTyped(event.target.value);
          }}
          className={inputClass(wrong)}
        />
      </PanelField>
      <ReasonField value={reason} onChange={setReason} help={t('p88shops.reasonHelp')} />
    </ActionPanel>
  );
}
